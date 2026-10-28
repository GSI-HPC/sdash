// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";

import { renderApp, resetPage } from "../testing/app";
import { clusterServer, reservations } from "../testing/cluster";

beforeEach(() => {
  resetPage();
});

// The times are written in the browser's time zone, which the tests do not
// fix: they look for the day, which is the same in every zone.
test("lists every reservation with where it stands, its times, what it holds, who may use it and its flags", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/reservations", server);

  const table = screen.getByRole("table", { name: "Reservations of virgo" });
  await expect.element(table).toBeVisible();
  const maintenance = table.getByRole("row").nth(1);
  const course = table.getByRole("row").nth(2);
  const later = table.getByRole("row").nth(3);
  await expect.element(maintenance.getByText("Upcoming")).toBeVisible();
  await expect.element(maintenance.getByText(/2 Jan/).first()).toBeVisible();
  await expect.element(maintenance.getByText("04:00:00")).toBeVisible();
  await expect.element(maintenance.getByText("2 nodes, 8 cores")).toBeVisible();
  await expect.element(maintenance.getByText("Users: root")).toBeVisible();
  await expect
    .element(maintenance.getByText("MAINT, SPEC_NODES"))
    .toBeVisible();
  await expect.element(course.getByText("Active")).toBeVisible();
  await expect.element(course.getByText("in main")).toBeVisible();
  await expect
    .element(course.getByText("Accounts: physics, not guests"))
    .toBeVisible();
  await expect.element(later.getByText("No end")).toBeVisible();
  await expect
    .element(screen.getByText(/^3 reservations, fetched/))
    .toBeVisible();
});

// The timeline is an image to assistive technology, which its name sends
// to the table; what it draws is checked in the tests of the primitive.
test("draws the reservations of the next days on a timeline, and leaves out the others", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/reservations", server);

  const timeline = screen.getByRole("img", {
    name: "The reservations of virgo from yesterday to six days from today; the table below lists them in words",
  });
  await expect.element(timeline).toBeVisible();
  const text = timeline.element().textContent;
  expect(text).toContain("maintenance");
  expect(text).toContain("course");
  expect(text).not.toContain("later");
});

test("says so when no reservation falls in the next days", async () => {
  const { server } = clusterServer({
    reservations: {
      body: { ...reservations, rows: reservations.rows.slice(2) },
    },
  });
  const screen = await renderApp("/reservations", server);

  await expect
    .element(
      screen.getByText(
        "No reservation holds its nodes from yesterday to six days from today.",
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: "Reservations of virgo" }))
    .toBeVisible();
});

test("says that the cluster holds no reservation", async () => {
  const { server } = clusterServer({
    reservations: { body: { ...reservations, rows: [] } },
  });
  const screen = await renderApp("/reservations", server);

  await expect
    .element(screen.getByRole("heading", { name: "No reservations" }))
    .toBeVisible();
});

test("says in words why there are no reservations to show when the server has none to give", async () => {
  const { server } = clusterServer({
    reservations: {
      status: 502,
      body: { code: "unauthenticated", message: "the token expired" },
    },
  });
  const screen = await renderApp("/reservations", server);

  await expect
    .element(screen.getByText("slurmrestd did not accept the token."))
    .toBeVisible();
});
