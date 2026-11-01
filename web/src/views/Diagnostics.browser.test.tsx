// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";

import { renderApp, resetPage } from "../testing/app";
import { clusterServer } from "../testing/cluster";

beforeEach(() => {
  resetPage();
});

test("counts the jobs since the reset, and shows the timing of both schedulers", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/diagnostics", server);

  const submitted = screen.getByRole("region", { name: "Submitted" });
  await expect.element(submitted.getByText("40")).toBeVisible();
  const main = screen.getByRole("region", { name: "Main scheduler" });
  await expect.element(main.getByText("1.2 ms")).toBeVisible();
  await expect.element(main.getByText("45 ms")).toBeVisible();
  const backfill = screen.getByRole("region", { name: "Backfill scheduler" });
  await expect.element(backfill.getByText("Idle")).toBeVisible();
  await expect.element(backfill.getByText("1.5 s")).toBeVisible();
  await expect.element(backfill.getByText("7 (5)")).toBeVisible();
  const daemon = screen.getByRole("region", { name: "slurmctld" });
  await expect.element(daemon.getByText("Server threads")).toBeVisible();
  await expect
    .element(screen.getByText(/^Counters reset .*, fetched/))
    .toBeVisible();
});

test("lists the calls by message type and by user, the busiest first", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/diagnostics", server);

  const types = screen.getByRole("table", { name: "Calls by message type" });
  await expect.element(types).toBeVisible();
  await expect
    .element(types.getByRole("row").nth(1).getByText("REQUEST_JOB_INFO"))
    .toBeVisible();
  await expect
    .element(types.getByRole("row").nth(1).getByText("960 ms"))
    .toBeVisible();
  const users = screen.getByRole("table", { name: "Calls by user" });
  await expect
    .element(users.getByRole("row").nth(1).getByText("alice"))
    .toBeVisible();
  await expect
    .element(users.getByRole("row").nth(2).getByText("225 ms"))
    .toBeVisible();
});

test("says in words why there are no diagnostics to show when the server has none to give", async () => {
  const { server } = clusterServer({
    diagnostics: {
      status: 502,
      body: { code: "unauthenticated", message: "the token expired" },
    },
  });
  const screen = await renderApp("/diagnostics", server);

  await expect
    .element(screen.getByText("slurmrestd did not accept the token."))
    .toBeVisible();
});
