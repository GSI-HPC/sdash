// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, type Page, test } from "@playwright/test";

import type { Status } from "../src/api/types.gen.ts";
import { heading, open, scan } from "./support.ts";

// The Overview: the one view that calls the browser API today, for the
// summary of which sdash is running.

// The address of the operation the view calls; a test that makes the call
// fail matches it under whatever host and port sdash is bound to.
const statusOperation = "**/api/v1/status";

// The whole way of the browser API, once: the built interface calls the
// server it was served by, with the session the printed address gave it,
// and shows the answer (doc/adr/0011-openapi-first-browser-api.md). What
// the page has to show is asked of the same server with the same session.
test("the Overview says which sdash is running", async ({ page }) => {
  const problems = await open(page);
  const answer = await page.request.get(
    new URL("/api/v1/status", page.url()).href,
  );
  expect(answer.status()).toBe(200);
  const status = (await answer.json()) as Status;

  await expect(heading(page)).toHaveText("Overview");
  const about = page.getByRole("main").getByRole("region", { name: "About" });
  // In the status region, where a screen reader announces it.
  await expect(about.getByRole("status")).toContainText(status.version);
  await expect(about.getByRole("status")).toContainText(status.platform);
  await expect(page.getByRole("alert")).toHaveCount(0);

  expect(problems).toEqual([]);
});

/**
 * Has the status say that sdash runs read-only. The sdash under test was
 * not started that way, so the answer is given here in its place; that a
 * sdash started with --read-only reports the mode is tested in Go.
 */
async function answerReadOnly(page: Page): Promise<void> {
  const status: Status = {
    version: "v1.4.0",
    goVersion: "go1.27.1",
    platform: "linux/arm64",
    readOnly: true,
    clusters: [],
  };
  await page.route(statusOperation, (route) => route.fulfill({ json: status }));
}

// A sdash started with --read-only refuses every change. The user has to
// be told, in words and where a screen reader announces it, and not by a
// colour.
test("a read-only sdash says so in the status region", async ({ page }) => {
  await answerReadOnly(page);
  const problems = await open(page);

  await expect(page.getByRole("status")).toContainText(
    "Read-only: this sdash changes nothing on a cluster",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);

  expect(problems).toEqual([]);
});

// No cluster is configured, and the view must say so and show nothing that
// could be taken for the state of one
// (doc/adr/0016-e2e-and-fixtures-on-sind.md).
test("the Overview says that no cluster is configured", async ({ page }) => {
  await open(page);

  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "No cluster configured" }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("No cluster", { exact: true }),
  ).toBeVisible();
});

// A user who stops sdash and comes back to the tab must be told, and told
// as an alert, which a screen reader announces at once.
test("a server that does not answer is reported as an alert", async ({
  page,
}) => {
  await page.route(statusOperation, (route) => route.abort());
  await open(page);

  await expect(page.getByRole("alert")).toContainText("sdash does not answer");
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    // The read-only mode adds a line to the view, and is scanned with it.
    test("the Overview passes the axe scan when sdash is read-only", async ({
      page,
    }) => {
      await answerReadOnly(page);
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("status")).toContainText("Read-only");

      expect(await scan(page)).toEqual([]);
    });

    // The failure is a state of the view like any other, with colours of
    // its own, and is scanned like it
    // (doc/adr/0014-accessibility-and-browsers.md). The view as it is when
    // the server answers is scanned with all the others, in
    // accessibility.spec.ts.
    test("the Overview passes the axe scan when the server does not answer", async ({
      page,
    }) => {
      await page.route(statusOperation, (route) => route.abort());
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("alert")).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });
  });
}
