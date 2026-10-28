// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, type Page, test } from "@playwright/test";

import type { JobList } from "../src/api/types.gen.ts";
import { heading, openAt, reload, scan } from "./support.ts";

// The Jobs view on the cluster of the fake slurmrestd, which answers with
// what the seeded sind cluster answered (e2e/seed.sh): eight jobs of alice
// and bob, in five states, and alice is the user of the token.

// The address of the operation the view reads its jobs from, under
// whatever host and port sdash is bound to.
const jobsOperation = "**/api/v1/clusters/virgo/jobs?*";

/** The table of the jobs, once it shows. */
function jobsTable(page: Page) {
  return page.getByRole("table", { name: "Jobs of virgo" });
}

test("the Jobs view shows the jobs of the cluster, the newest first, the user's own marked", async ({
  page,
}) => {
  const problems = await openAt(page, "/jobs", { instance: "cluster" });
  const rows = jobsTable(page).locator("tbody tr");

  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toContainText("8_[1-3]");
  await expect(rows.first()).toContainText("PENDING");
  await expect(rows.first().getByText("you")).toBeVisible();
  await expect(page.getByRole("button", { name: "Running 2" })).toBeVisible();
  await expect(page.getByText(/^8 jobs, fetched/)).toBeVisible();
  expect(problems).toEqual([]);
});

// A filter lives in the address, so a reload and a link keep it
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md); the server does
// the filtering.
test("a state is chosen by the keyboard, kept in the address and kept by a reload", async ({
  page,
}) => {
  const problems = await openAt(page, "/jobs", { instance: "cluster" });
  await expect(jobsTable(page)).toBeVisible();

  const pending = page.getByRole("button", { name: "Pending 3" });
  await pending.focus();
  await page.keyboard.press("Space");

  await expect(pending).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/[?&]state=PENDING(&|$)/);
  await expect(jobsTable(page).locator("tbody tr")).toHaveCount(3);

  await reload(page);
  await expect(heading(page)).toHaveText("Jobs");
  await expect(jobsTable(page).locator("tbody tr")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Pending 3" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(problems).toEqual([]);
});

test("a column is sorted by the keyboard alone", async ({ page }) => {
  const problems = await openAt(page, "/jobs", { instance: "cluster" });
  await expect(jobsTable(page)).toBeVisible();

  await page.getByRole("button", { name: "User" }).focus();
  await page.keyboard.press("Enter");

  await expect(
    jobsTable(page).getByRole("columnheader", { name: "User" }),
  ).toHaveAttribute("aria-sort", "ascending");
  await expect(page).toHaveURL(/[?&]sort=user&order=asc(&|$)/);
  await expect(jobsTable(page).locator("tbody tr").last()).toContainText("bob");
  expect(problems).toEqual([]);
});

test("the Jobs view of a sdash without a cluster says that none is configured", async ({
  page,
}) => {
  const problems = await openAt(page, "/jobs");

  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "No cluster configured" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

/**
 * Has the server's jobs carry the failure of a fetch that came after them,
 * as when slurmrestd stopped answering after sdash had read the jobs once.
 */
async function answerStale(page: Page): Promise<void> {
  await page.route(jobsOperation, async (route) => {
    const response = await route.fetch();
    const list = (await response.json()) as JobList;
    await route.fulfill({
      response,
      json: {
        ...list,
        error: { code: "unavailable", message: "connection refused" },
      },
    });
  });
}

/** Has the server have no jobs to give, as when the token was refused. */
async function answerRefused(page: Page): Promise<void> {
  await page.route(jobsOperation, (route) =>
    route.fulfill({
      status: 502,
      json: {
        code: "unauthenticated",
        message: "slurmrestd refused the token",
      },
    }),
  );
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test("the Jobs view passes the scan with its jobs", async ({ page }) => {
      await openAt(page, "/jobs", { instance: "cluster", colorScheme: theme });
      await expect(jobsTable(page).locator("tbody tr")).toHaveCount(8);

      expect(await scan(page)).toEqual([]);
    });

    test("the Jobs view passes the scan with no job that matches", async ({
      page,
    }) => {
      await openAt(page, "/jobs?q=nothing-matches", {
        instance: "cluster",
        colorScheme: theme,
      });
      await expect(
        page.getByRole("heading", { name: "No jobs match these filters" }),
      ).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });

    test("the Jobs view passes the scan with jobs that may be out of date", async ({
      page,
    }) => {
      await answerStale(page);
      await openAt(page, "/jobs", { instance: "cluster", colorScheme: theme });
      await expect(jobsTable(page)).toBeVisible();
      await expect(page.getByText("slurmrestd does not answer.")).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });

    // The browser reports the answer 502 as an error of its own, so what
    // it reports is not checked here.
    test("the Jobs view passes the scan with no jobs to show", async ({
      page,
    }) => {
      await answerRefused(page);
      await openAt(page, "/jobs", { instance: "cluster", colorScheme: theme });
      await expect(
        page.getByText("slurmrestd did not accept the token."),
      ).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });
  });
}
