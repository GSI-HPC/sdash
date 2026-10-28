// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";

import { renderApp, resetPage } from "../testing/app";
import { clusterServer } from "../testing/cluster";

beforeEach(() => {
  resetPage();
});

test("shows each partition with its state, its limits, the states of its nodes, its CPUs and its jobs", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/partitions", server);

  const table = screen.getByRole("table", { name: "Partitions of virgo" });
  await expect.element(table).toBeVisible();
  const gpu = table.getByRole("row").nth(2);
  await expect.element(gpu.getByText("gpu-[1-2]")).toBeVisible();
  await expect.element(gpu.getByText("DRAIN", { exact: true })).toBeVisible();
  await expect
    .element(gpu.getByRole("group", { name: "States of the 2 nodes of gpu" }))
    .toHaveTextContent("Mixed1Drain1");
  await expect
    .element(gpu.getByRole("meter", { name: "CPUs allocated in gpu" }))
    .toHaveAttribute("aria-valuenow", "4");
  await expect.element(gpu.getByText("no limit / none")).toBeVisible();
  await expect
    .element(table.getByRole("row").nth(1).getByText("1-00:00:00 / 01:00:00"))
    .toBeVisible();
  await expect
    .element(gpu.getByRole("link", { name: "1 jobs in gpu" }))
    .toBeVisible();
});

test("leads from a partition to its nodes and its jobs, on the cluster it shows", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/partitions?cluster=lyra", server);

  await expect
    .element(screen.getByRole("link", { name: "main", exact: true }))
    .toHaveAttribute("href", "/nodes?cluster=lyra&partition=main");
  await expect
    .element(screen.getByRole("link", { name: "4 jobs in main" }))
    .toHaveAttribute("href", "/jobs?cluster=lyra&partition=main");
});

test("shows the partitions when the nodes cannot be read, and says why their columns are empty", async () => {
  const { server } = clusterServer({
    nodes: {
      status: 502,
      body: { code: "forbidden", message: "access denied" },
    },
  });
  const screen = await renderApp("/partitions", server);

  await expect
    .element(screen.getByRole("table", { name: "Partitions of virgo" }))
    .toBeVisible();
  await expect
    .element(screen.getByText(/^The nodes could not be read/))
    .toBeVisible();
});
