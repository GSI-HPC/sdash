// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { renderApp, resetPage } from "../testing/app";
import { clusterServer } from "../testing/cluster";

beforeEach(() => {
  resetPage();
});

test("shows every node of the cluster as a cell named by its state and its figures", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes", server);

  const map = screen.getByRole("grid", { name: "Nodes of virgo" });
  await expect.element(map).toBeVisible();
  await expect
    .element(
      map.getByRole("gridcell", {
        name: "gpu-2, Drain, 0 of 8 CPUs allocated, load 0.00, 0 MB of 2 GB memory allocated, reason: bad disk",
      }),
    )
    .toBeInTheDocument();
  expect(map.getByRole("gridcell").all()).toHaveLength(4);
  await expect.element(screen.getByText(/^4 nodes, fetched/)).toBeVisible();
});

test("shows the nodes of the states pressed, and keeps them in the address", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes", server);
  const map = screen.getByRole("grid", { name: "Nodes of virgo" });
  await expect.element(map).toBeVisible();

  await screen.getByRole("button", { name: "Drain 1" }).click();
  await screen.getByRole("button", { name: "Mixed 1" }).click();

  await expect.poll(() => map.getByRole("gridcell").all()).toHaveLength(2);
  await expect
    .element(screen.getByText(/^2 of 4 nodes, fetched/))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Drain 1" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("finds nodes by a part of their name, in any case", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes", server);
  const map = screen.getByRole("grid", { name: "Nodes of virgo" });
  await expect.element(map).toBeVisible();

  await userEvent.type(
    screen.getByRole("textbox", { name: "Find nodes" }),
    "GPU",
  );

  await expect.poll(() => map.getByRole("gridcell").all()).toHaveLength(2);
});

test("shows the nodes of the partition the address names", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes?partition=main", server);
  const map = screen.getByRole("grid", { name: "Nodes of virgo" });
  await expect.element(map).toBeVisible();

  await expect.poll(() => map.getByRole("gridcell").all()).toHaveLength(2);
});

test("says that no node passes the filters, and takes them away when asked", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes?q=nothing", server);

  await expect
    .element(
      screen.getByRole("heading", { name: "No nodes match these filters" }),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "Clear the filters" }).click();

  await expect
    .element(screen.getByRole("grid", { name: "Nodes of virgo" }))
    .toBeVisible();
});

test("says in words why there are no nodes to show when the server has none to give", async () => {
  const { server } = clusterServer({
    nodes: {
      status: 502,
      body: { code: "unavailable", message: "connection refused" },
    },
  });
  const screen = await renderApp("/nodes", server);

  await expect
    .element(screen.getByText("slurmrestd does not answer."))
    .toBeVisible();
  await expect.element(screen.getByText("connection refused")).toBeVisible();
});

test("opens the drawer of a node pressed on the map, with why it is drained", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes", server);
  const map = screen.getByRole("grid", { name: "Nodes of virgo" });
  await expect.element(map).toBeVisible();

  await map.getByRole("gridcell", { name: /^gpu-2,/ }).click();

  const drawer = screen.getByRole("dialog", { name: "gpu-2" });
  await expect.element(drawer).toBeVisible();
  await expect.element(drawer.getByText("bad disk")).toBeVisible();
  await expect
    .element(drawer.getByRole("meter", { name: "CPUs allocated" }))
    .toBeVisible();

  await userEvent.keyboard("{Escape}");
  await expect.element(drawer).not.toBeInTheDocument();
});

test("lists the jobs of a node in its drawer, each a link to its own drawer", async () => {
  const { server, asked } = clusterServer();
  const screen = await renderApp("/nodes?node=gpu-1", server);

  const drawer = screen.getByRole("dialog", { name: "gpu-1" });
  const jobs = drawer.getByRole("table", { name: "Jobs on gpu-1" });
  await expect.element(jobs).toBeVisible();
  await expect
    .element(jobs.getByRole("link", { name: "7" }))
    .toHaveAttribute("href", "/jobs?job=7");
  expect(
    asked.find((url) => url.searchParams.get("node") === "gpu-1"),
  ).toBeDefined();
});

test("says so in the drawer when the address names a node the cluster lacks", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes?node=gpu-9", server);

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "gpu-9" })
        .getByRole("heading", { name: "No such node" }),
    )
    .toBeVisible();
});
