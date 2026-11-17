// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { openAt, scan, settled } from "../support.ts";

// The views of cluster data against the slurmrestd of the seeded sind
// cluster itself (e2e/seed.sh), as alice, the user of the token of
// e2e/browser.sh: eight jobs of alice and bob, two of them running, three
// workers, one of them drained and reserved for maintenance, in the one
// partition "all". The browser tests of web/e2e check the same views in
// detail against captures of this cluster; these check that the views hold
// on the answers of a live daemon, and leave a screenshot of each in both
// themes for whoever reviews a change (doc/adr/0016-e2e-and-fixtures-on-sind.md).

/** The name of the cluster in the profile file e2e/browser.sh writes. */
const cluster = "e2e";

interface View {
  path: string;
  title: string;
  /** What the view shows once the cluster's answers have arrived. */
  shows: (page: Page) => Promise<void>;
}

const views: View[] = [
  {
    path: "/overview",
    title: "Overview",
    shows: async (page) => {
      const main = page.getByRole("main");
      await expect(
        main
          .getByRole("grid", { name: `Nodes of ${cluster}` })
          .getByRole("gridcell"),
      ).toHaveCount(3);
      await expect(
        main.getByRole("region", { name: "Connection" }).getByText("alice"),
      ).toBeVisible();
      await expect(
        page.getByRole("banner").getByText("Live", { exact: true }),
      ).toBeVisible();
    },
  },
  {
    path: "/jobs",
    title: "Jobs",
    shows: async (page) => {
      const rows = page
        .getByRole("table", { name: `Jobs of ${cluster}` })
        .locator("tbody tr");
      await expect(rows).toHaveCount(8);
      await expect(rows.first()).toContainText("8_[1-3]");
      await expect(rows.first().getByText("you")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Running 2" }),
      ).toBeVisible();
      await expect(page.getByText(/^8 jobs, fetched/)).toBeVisible();
    },
  },
  {
    path: "/nodes",
    title: "Nodes",
    shows: async (page) => {
      const map = page.getByRole("grid", { name: `Nodes of ${cluster}` });
      await expect(map.getByRole("gridcell")).toHaveCount(3);
      await expect(
        map.getByRole("gridcell", { name: /^worker-2, Drain/ }),
      ).toBeVisible();
      await expect(page.getByText(/^3 nodes, fetched/)).toBeVisible();
    },
  },
  {
    path: "/partitions",
    title: "Partitions",
    shows: async (page) => {
      const row = page
        .getByRole("table", { name: `Partitions of ${cluster}` })
        .getByRole("row", { name: /^all / });
      await expect(row.getByText("UP")).toBeVisible();
      await expect(row.getByText("worker-[0-2]")).toBeVisible();
    },
  },
  {
    path: "/reservations",
    title: "Reservations",
    shows: async (page) => {
      const row = page
        .getByRole("table", { name: `Reservations of ${cluster}` })
        .getByRole("row", { name: /^maintenance / });
      await expect(row.getByText("Active")).toBeVisible();
      await expect(row.getByText("worker-2")).toBeVisible();
      await expect(
        page.getByRole("img", {
          name: new RegExp(`^The reservations of ${cluster} from yesterday`),
        }),
      ).toBeVisible();
    },
  },
  {
    path: "/diagnostics",
    title: "Diagnostics",
    shows: async (page) => {
      await expect(
        page.getByRole("region", { name: "Main scheduler" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Backfill scheduler" }),
      ).toBeVisible();
      // sdash itself reads the cluster as alice, so she has had calls.
      await expect(
        page
          .getByRole("table", { name: "Calls by user" })
          .getByRole("row", { name: /^alice / }),
      ).toBeVisible();
    },
  },
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const view of views) {
      test(`the ${view.title} view shows the live cluster and passes the scan`, async ({
        page,
      }, testInfo) => {
        const problems = await openAt(page, view.path, {
          colorScheme,
          instance: "cluster",
        });
        await settled(page, view.title);
        await view.shows(page);

        // For the reviewer, side by side in one directory of the output,
        // which CI keeps as an artefact.
        await page.screenshot({
          path: path.join(
            testInfo.project.outputDir,
            "screenshots",
            `${view.title.toLowerCase()}-${colorScheme}.png`,
          ),
          fullPage: true,
        });
        expect(await scan(page)).toEqual([]);
        expect(problems).toEqual([]);
      });
    }
  });
}
