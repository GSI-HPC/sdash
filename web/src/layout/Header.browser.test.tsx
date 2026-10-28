// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { renderApp, resetPage } from "../testing/app";
import { clusterServer, pulseOf } from "../testing/cluster";

beforeEach(() => {
  resetPage();
});

test("names the cluster the page shows and its release, and says that it is live", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes", server);

  const banner = screen.getByRole("banner");
  await expect
    .element(banner.getByRole("button", { name: "Cluster virgo 1.2.3" }))
    .toBeVisible();
  await expect.element(banner.getByText("Live")).toBeVisible();
});

test("says in a word why a cluster cannot be reached", async () => {
  const { server } = clusterServer({
    pulse: () => ({
      body: {
        connection: {
          connected: false,
          error: { code: "unauthenticated", message: "token expired" },
        },
        kinds: [],
      },
    }),
  });
  const screen = await renderApp("/overview", server);

  await expect
    .element(screen.getByRole("banner").getByText("Auth", { exact: true }))
    .toBeVisible();
});

test("asks for the pulse of the kinds of the view that shows, the one the view asks for", async () => {
  const { server, asked } = clusterServer();
  const screen = await renderApp("/nodes", server);
  await expect
    .element(screen.getByRole("grid", { name: "Nodes of virgo" }))
    .toBeVisible();

  // One pulse for the header and the view, whose kinds are the view's: the
  // pulse may be asked for more than once, as React's strict mode mounts
  // twice and so cancels the first request.
  const kinds = asked
    .filter((url) => url.pathname.endsWith("/pulse"))
    .map((url) => url.searchParams.getAll("kinds").join(","));
  expect(new Set(kinds)).toEqual(new Set(["nodes"]));
});

test("switches to another cluster from its menu, on the same view", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes?state=DRAIN", server);
  await expect
    .element(screen.getByRole("grid", { name: "Nodes of virgo" }))
    .toBeVisible();

  await screen.getByRole("button", { name: /^Cluster virgo/ }).click();
  await page.getByRole("menuitemradio", { name: "lyra" }).click();

  await expect
    .element(screen.getByRole("grid", { name: "Nodes of lyra" }))
    .toBeVisible();
  // The filters of the view belong to the cluster they were set on.
  await expect
    .element(screen.getByRole("button", { name: "All" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("keeps the cluster from one view to the next, by a link and by a shortcut", async () => {
  const { server } = clusterServer();
  const screen = await renderApp("/nodes?cluster=lyra", server);
  await expect
    .element(screen.getByRole("grid", { name: "Nodes of lyra" }))
    .toBeVisible();

  await screen
    .getByRole("navigation", { name: "Views" })
    .getByRole("link", { name: "Partitions" })
    .click();
  await expect
    .element(screen.getByRole("table", { name: "Partitions of lyra" }))
    .toBeVisible();

  await userEvent.keyboard("go");
  await expect
    .element(screen.getByRole("grid", { name: "Nodes of lyra" }))
    .toBeVisible();
});

test("keeps the cluster the root address names on the way to the Overview", async () => {
  const { server } = clusterServer({
    pulse: (url) => ({ body: pulseOf(url) }),
  });
  const screen = await renderApp("/?cluster=lyra", server);

  await expect
    .element(screen.getByRole("grid", { name: "Nodes of lyra" }))
    .toBeVisible();
});
