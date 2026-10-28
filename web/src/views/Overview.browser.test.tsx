// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";

import { renderApp, resetPage } from "../testing/app";
import { clusterServer } from "../testing/cluster";

beforeEach(() => {
  resetPage();
});

test("counts the nodes by state, the CPUs and the memory allocated, and the jobs", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/overview", server);

  const nodes = screen.getByRole("region", { name: "Nodes" });
  await expect.element(nodes.getByText("4", { exact: true })).toBeVisible();
  await expect
    .element(nodes.getByRole("group", { name: "States of the nodes" }))
    .toHaveTextContent("Allocated1Idle1Mixed1Drain1");
  const cpus = screen.getByRole("region", { name: "CPUs allocated" });
  await expect.element(cpus.getByText("38%")).toBeVisible();
  await expect.element(cpus.getByText("12 of 32")).toBeVisible();
  await expect
    .element(cpus.getByRole("meter", { name: "Memory allocated" }))
    .toHaveAttribute("aria-valuetext", "3 GB of 8 GB");
  const jobs = screen.getByRole("region", { name: "Jobs" });
  await expect.element(jobs.getByText("3", { exact: true })).toBeVisible();
  await expect
    .element(jobs.getByText("2 pending, 2 yours, 5 in all"))
    .toBeVisible();
});

test("shows the CPUs allocated in each partition, the connection and a map of the nodes", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/overview?cluster=lyra", server);

  await expect
    .element(
      screen
        .getByRole("region", { name: "CPUs allocated by partition" })
        .getByRole("meter", { name: "main" }),
    )
    .toHaveAttribute("aria-valuenow", "8");
  const connection = screen.getByRole("region", { name: "Connection" });
  await expect
    .element(connection.getByText("Live: sdash is connected to slurmrestd."))
    .toBeVisible();
  await expect
    .element(connection.getByText("https://lyra.example:6820"))
    .toBeVisible();
  await expect.element(connection.getByText("1.2.3")).toBeVisible();
  await expect
    .element(screen.getByRole("grid", { name: "Nodes of lyra" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "All nodes" }))
    .toHaveAttribute("href", "/nodes?cluster=lyra");
});

test("says why the nodes are missing, and still counts the jobs", async () => {
  const { server } = clusterServer({
    nodes: {
      status: 502,
      body: { code: "unauthenticated", message: "slurmrestd answered 401" },
    },
  });
  const screen = await renderApp("/overview", server);

  await expect
    .element(
      screen
        .getByRole("region", { name: "Nodes" })
        .getByText("slurmrestd did not accept the token."),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("2 pending, 2 yours, 5 in all"))
    .toBeVisible();
});

test("still says which sdash is running", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/overview", server);

  await expect
    .element(screen.getByRole("region", { name: "About" }).getByText("v1.4.0"))
    .toBeVisible();
});
