// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, type Page, test } from "@playwright/test";

import { heading, openAt, reload, scan } from "./support.ts";

// The Nodes, Partitions and Overview views and the header on the cluster
// of the fake slurmrestd, which answers with what the seeded sind cluster
// answered (e2e/seed.sh): three nodes, two of them allocated and one
// drained, in the one partition "all"
// (doc/adr/0036-the-cluster-views-on-real-data.md).

/** The map of the nodes, once it shows. */
function nodeMap(page: Page) {
  return page.getByRole("grid", { name: "Nodes of virgo" });
}

/** The table of the partitions, once it shows. */
function partitionTable(page: Page) {
  return page.getByRole("table", { name: "Partitions of virgo" });
}

test("the Nodes view shows every node of the cluster in the colour of its state", async ({
  page,
}) => {
  const problems = await openAt(page, "/nodes", { instance: "cluster" });

  await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(3);
  await expect(
    nodeMap(page).getByRole("gridcell", { name: /^worker-2, Drain/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Drain 1" })).toBeVisible();
  await expect(page.getByText(/^3 nodes, fetched/)).toBeVisible();
  expect(problems).toEqual([]);
});

test("a state of the nodes is chosen by the keyboard, kept in the address and kept by a reload", async ({
  page,
}) => {
  const problems = await openAt(page, "/nodes", { instance: "cluster" });
  await expect(nodeMap(page)).toBeVisible();

  const drain = page.getByRole("button", { name: "Drain 1" });
  await drain.focus();
  await page.keyboard.press("Space");

  await expect(drain).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/[?&]state=DRAIN(&|$)/);
  await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(1);

  await reload(page);
  await expect(heading(page)).toHaveText("Nodes");
  await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("the Partitions view shows each partition with its nodes and its jobs, and leads to them", async ({
  page,
}) => {
  const problems = await openAt(page, "/partitions", { instance: "cluster" });
  const row = partitionTable(page).getByRole("row", { name: /^all / });

  await expect(row).toBeVisible();
  await expect(row.getByText("UP")).toBeVisible();
  await expect(row.getByText("worker-[0-2]")).toBeVisible();

  await row.getByRole("link", { name: "all", exact: true }).click();
  await expect(heading(page)).toHaveText("Nodes");
  // The address named no cluster, and the link names none either.
  await expect(page).toHaveURL(/\/nodes\?partition=all$/);
  await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(3);
  expect(problems).toEqual([]);
});

test("the Overview shows the cluster at a glance and the connection to it", async ({
  page,
}) => {
  const problems = await openAt(page, "/overview", { instance: "cluster" });
  const connection = page
    .getByRole("main")
    .getByRole("region", { name: "Connection" });

  await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(3);
  await expect(connection.getByText("alice")).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("Live", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("button", { name: /^Cluster virgo / }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("the cluster switcher lists the clusters of the profile file", async ({
  page,
}) => {
  const problems = await openAt(page, "/overview", { instance: "cluster" });
  await expect(nodeMap(page)).toBeVisible();

  await page.getByRole("button", { name: /^Cluster virgo / }).click();
  await expect(page.getByRole("menuitemradio")).toHaveText(["virgo"]);
  await expect(
    page.getByRole("menuitemradio", { name: "virgo" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(problems).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test("the Nodes view passes the scan with its nodes", async ({ page }) => {
      await openAt(page, "/nodes", { instance: "cluster", colorScheme: theme });
      await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(3);

      expect(await scan(page)).toEqual([]);
    });

    test("the Nodes view passes the scan with no node that matches", async ({
      page,
    }) => {
      await openAt(page, "/nodes?q=nothing-matches", {
        instance: "cluster",
        colorScheme: theme,
      });
      await expect(
        page.getByRole("heading", { name: "No nodes match these filters" }),
      ).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });

    test("the Partitions view passes the scan with its partitions", async ({
      page,
    }) => {
      await openAt(page, "/partitions", {
        instance: "cluster",
        colorScheme: theme,
      });
      await expect(
        partitionTable(page).getByRole("row", { name: /^all / }),
      ).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });

    test("the Overview passes the scan with the cluster", async ({ page }) => {
      await openAt(page, "/overview", {
        instance: "cluster",
        colorScheme: theme,
      });
      await expect(nodeMap(page).getByRole("gridcell")).toHaveCount(3);

      expect(await scan(page)).toEqual([]);
    });

    test("the cluster switcher passes the scan with its menu open", async ({
      page,
    }) => {
      await openAt(page, "/overview", {
        instance: "cluster",
        colorScheme: theme,
      });
      await expect(nodeMap(page)).toBeVisible();
      await page.getByRole("button", { name: /^Cluster virgo / }).click();
      await expect(page.getByRole("menu")).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });
  });
}
