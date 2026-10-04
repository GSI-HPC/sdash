// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

import type { Status } from "../src/api/types.gen.ts";
import { open, scan } from "./support.ts";

// The address of the one operation the shell calls; a test that makes the
// call fail matches it under whatever host and port sdash is bound to.
const statusOperation = "**/api/v1/status";

// A screen reader user finds the content through the main landmark and
// learns what the page is from its one top-level heading.
test("the shell has a main landmark with the one level-one heading", async ({
  page,
}) => {
  await open(page);

  await expect(page).toHaveTitle("sdash");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
});

// The server allows no inline script, no inline style and no other host
// (doc/adr/0012-local-listener-security.md). A build that needed one of
// them would work under "npm run dev" and break in the binary, so this is
// checked where the policy is in force.
test("the built interface runs under the server's Content-Security-Policy", async ({
  page,
}) => {
  const problems = await open(page);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();

  // The script ran: it sets the theme.
  await expect(page.locator("html")).toHaveAttribute("data-theme", /./);
  // The stylesheet applies: the heading is set in the design's font.
  await expect(heading).toHaveCSS("font-family", /DM Sans Variable/);
  // The fonts load from the server itself: a face of each family is in use
  // on this page, and none failed.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(({ family, status }) => ({
      // A browser may report the family with or without its quotes.
      family: family.replaceAll('"', ""),
      status,
    }));
  });
  expect(fonts).toContainEqual({
    family: "DM Sans Variable",
    status: "loaded",
  });
  expect(fonts).toContainEqual({ family: "DM Mono", status: "loaded" });
  expect(fonts.filter(({ status }) => status === "error")).toEqual([]);

  expect(problems).toEqual([]);
});

// The server answers every address of the application with the same page,
// so that a reload of a view, or a link to one, works. The page then has to
// name its script and its stylesheet from the root: named relative to the
// address, they would be asked for below it, where the server has only the
// page itself to give.
test("the interface loads at an address below the root", async ({ page }) => {
  const problems = await open(page);

  await page.goto(new URL("/jobs/4711", page.url()).href);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-family",
    /DM Sans Variable/,
  );
  expect(problems).toEqual([]);
});

// The whole way of the browser API, once: the built interface calls the
// server it was served by, with the session the printed address gave it,
// and shows the answer (doc/adr/0011-openapi-first-browser-api.md). What
// the page has to show is asked of the same server with the same session.
test("the main region says which sdash is running", async ({ page }) => {
  const problems = await open(page);
  const answer = await page.request.get(
    new URL("/api/v1/status", page.url()).href,
  );
  expect(answer.status()).toBe(200);
  const status = (await answer.json()) as Status;

  const about = page.getByRole("main").getByRole("region", { name: "About" });
  // In the status region, where a screen reader announces it.
  await expect(about.getByRole("status")).toContainText(status.version);
  await expect(about.getByRole("status")).toContainText(status.platform);
  await expect(page.getByRole("alert")).toHaveCount(0);

  expect(problems).toEqual([]);
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
    // Without a stored choice the page takes the theme the system prefers.
    test.use({ colorScheme: theme });

    // The automated part of the accessibility target, WCAG 2.1 AA. Every
    // view is scanned in both themes, since contrast differs between them
    // (doc/adr/0014-accessibility-and-browsers.md).
    test("the shell passes the axe scan", async ({ page }) => {
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // The scan sees the page as it is at that moment, so it waits for the
      // answer of the server to be on it.
      await expect(page.getByRole("status")).toContainText("Version");

      expect(await scan(page)).toEqual([]);
    });

    // The failure is a state of the view like any other, with colours of
    // its own, and is scanned like it.
    test("the shell passes the axe scan when the server does not answer", async ({
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
