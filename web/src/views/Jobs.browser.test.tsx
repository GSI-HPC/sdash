// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";

import type { Job, JobList, Pulse } from "../client/client";
import {
  type Answer,
  renderApp,
  resetPage,
  type Server,
  status,
} from "../testing/app";

// The answers of sdash's own API, written here: the shapes are those of
// api/openapi.yaml, which the types hold them to, and no shape of
// slurmrestd's reaches the browser
// (doc/adr/0034-cluster-data-in-the-browser-api.md).

const fetchedAt = "2026-01-01T12:00:00Z";

function job(id: number, more: Partial<Job> = {}): Job {
  return {
    id,
    displayId: String(id),
    name: `example-${String(id)}`,
    user: "alice",
    account: "physics",
    partition: "main",
    qos: "normal",
    state: "RUNNING",
    flags: [],
    nodes: "node-1",
    cpus: 4,
    priority: 100,
    startTime: "2026-01-01T11:00:00Z",
    timeLimit: 120,
    ...more,
  };
}

const jobs: JobList = {
  generation: 1,
  fetchedAt,
  total: 3,
  rows: [
    job(3),
    job(2, { user: "bob" }),
    job(1, {
      state: "PENDING",
      reason: "Resources",
      arrayJobId: 1,
      displayId: "1_[1-4]",
    }),
  ],
  facets: {
    states: [
      { value: "RUNNING", count: 2 },
      { value: "PENDING", count: 1 },
    ],
    users: [
      { value: "alice", count: 2 },
      { value: "bob", count: 1 },
    ],
    partitions: [{ value: "main", count: 3 }],
  },
};

const pulse: Pulse = {
  connection: { connected: true, user: "alice" },
  kinds: [{ kind: "jobs", generation: 1, fetchedAt, period: 30 }],
};

/** A status that names the clusters virgo and lyra. */
const twoClusters = {
  ...status,
  clusters: [
    { name: "virgo", endpoint: "https://virgo.example:6820" },
    { name: "lyra", endpoint: "https://lyra.example:6820" },
  ],
};

/**
 * A server with the clusters virgo and lyra, which answers a page of jobs
 * with `list` and keeps every request for them in `asked`.
 */
function cluster(list: Answer = { body: jobs }): {
  server: Server;
  asked: URL[];
} {
  const asked: URL[] = [];
  return {
    asked,
    server(url) {
      if (url.pathname === "/api/v1/status") {
        return { body: twoClusters };
      }
      if (url.pathname.endsWith("/pulse")) {
        return { body: pulse };
      }
      if (url.pathname.endsWith("/jobs")) {
        asked.push(url);
        return list;
      }
      return undefined;
    },
  };
}

/** The query of the last request for jobs, as an object. */
function lastQuery(asked: readonly URL[]): Record<string, string> {
  const url = asked.at(-1);
  return Object.fromEntries(url?.searchParams.entries() ?? []);
}

beforeEach(() => {
  resetPage();
});

test("says that no cluster is configured when the profile file names none", async () => {
  const screen = await renderApp("/jobs");

  await expect
    .element(screen.getByRole("heading", { name: "No cluster configured" }))
    .toBeVisible();
});

test("says so when the address names a cluster the profile file does not", async () => {
  const { server } = cluster();
  const screen = await renderApp("/jobs?cluster=draco", server);

  await expect
    .element(screen.getByRole("heading", { name: "No cluster named draco" }))
    .toBeVisible();
  await expect
    .element(screen.getByText(/It names virgo, lyra\.$/))
    .toBeVisible();
});

test("shows the first page of the jobs of the first cluster, the newest first, the user's own marked", async () => {
  const { server, asked } = cluster();
  const screen = await renderApp("/jobs", server);
  const table = screen.getByRole("table", { name: "Jobs of virgo" });

  await expect.element(table).toBeVisible();
  expect(asked[0]?.pathname).toBe("/api/v1/clusters/virgo/jobs");
  await expect
    .poll(() => lastQuery(asked))
    .toEqual({
      sort: "id",
      order: "desc",
      offset: "0",
      limit: "50",
    });
  expect(table.element().querySelectorAll("tbody tr")).toHaveLength(3);
  await expect.element(table.getByText("you")).toHaveLength(2);
  await expect.element(table.getByText("Array")).toBeVisible();
  await expect.element(table.getByText("Resources")).toBeVisible();
  await expect.element(screen.getByText(/^3 jobs, fetched/)).toBeVisible();
});

test("shows the cluster the address names", async () => {
  const { server, asked } = cluster();
  const screen = await renderApp("/jobs?cluster=lyra", server);

  await expect
    .element(screen.getByRole("table", { name: "Jobs of lyra" }))
    .toBeVisible();
  expect(asked[0]?.pathname).toBe("/api/v1/clusters/lyra/jobs");
});

test("asks the server for the jobs of a state when its chip is pressed, from the first page", async () => {
  const { server, asked } = cluster();
  const screen = await renderApp("/jobs?page=2", server);
  await expect.element(screen.getByRole("table")).toBeVisible();

  await screen.getByRole("button", { name: "Pending 1" }).click();

  await expect
    .element(screen.getByRole("button", { name: "Pending 1" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => lastQuery(asked))
    .toMatchObject({ state: "PENDING", offset: "0" });
  await screen.getByRole("button", { name: "All", exact: true }).click();
  await expect.poll(() => lastQuery(asked)).not.toHaveProperty("state");
});

test("asks the server for the user's own jobs when My jobs is pressed", async () => {
  const { server, asked } = cluster();
  const screen = await renderApp("/jobs", server);

  await screen.getByRole("button", { name: "My jobs" }).click();

  await expect
    .element(screen.getByRole("button", { name: "My jobs" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => lastQuery(asked)).toMatchObject({ user: "alice" });
});

test("asks the server for the order a header names, from the first page", async () => {
  const { server, asked } = cluster();
  const screen = await renderApp("/jobs?page=2", server);
  await expect.element(screen.getByRole("table")).toBeVisible();

  await screen.getByRole("button", { name: "Priority" }).click();

  await expect
    .element(screen.getByRole("columnheader", { name: "Priority" }))
    .toHaveAttribute("aria-sort", "descending");
  await expect
    .poll(() => lastQuery(asked))
    .toMatchObject({
      sort: "priority",
      order: "desc",
      offset: "0",
    });
});

test("goes to the next page and back", async () => {
  const { server, asked } = cluster({ body: { ...jobs, total: 120 } });
  const screen = await renderApp("/jobs", server);
  await expect.element(screen.getByText("Jobs 1 to 3 of 120")).toBeVisible();

  await screen.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => lastQuery(asked)).toMatchObject({ offset: "50" });
  await screen.getByRole("button", { name: "Previous page" }).click();
  await expect.poll(() => lastQuery(asked)).toMatchObject({ offset: "0" });
});

test("says in words why there are no jobs to show when the server has none to give", async () => {
  const { server } = cluster({
    status: 502,
    body: { code: "unauthenticated", message: "slurmrestd answered 401" },
  });
  const screen = await renderApp("/jobs", server);

  await expect
    .element(screen.getByText("slurmrestd did not accept the token."))
    .toBeVisible();
  await expect
    .element(screen.getByText("slurmrestd answered 401"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Retry" }))
    .toBeVisible();
});

// The pulse of the cluster reports jobs that sdash holds, and their
// read still fails: asked again at once, it would be asked for in a loop,
// the error and the skeleton taking turns.
test("asks for jobs that could not be read again only when their generation grows", async () => {
  const { server, asked } = cluster({
    status: 502,
    body: { code: "unauthenticated", message: "slurmrestd answered 401" },
  });
  const screen = await renderApp("/jobs", server);

  await expect
    .element(screen.getByText("slurmrestd did not accept the token."))
    .toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 500));

  // One read before the pulse arrived, and at most one when it did.
  expect(asked.length).toBeLessThanOrEqual(2);
  await expect
    .element(screen.getByText("slurmrestd did not accept the token."))
    .toBeVisible();
});

test("shows jobs that could not be fetched again, with a banner that says why", async () => {
  const { server } = cluster({
    body: {
      ...jobs,
      error: { code: "unavailable", message: "connection refused" },
    },
  });
  const screen = await renderApp("/jobs", server);

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expect
    .element(screen.getByRole("status").filter({ hasText: "out of date" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("slurmrestd does not answer."))
    .toBeVisible();
});

test("says that no job passes the filters, and takes them away when asked", async () => {
  const { server, asked } = cluster({
    body: { ...jobs, total: 0, rows: [] },
  });
  const screen = await renderApp("/jobs?q=nothing&state=FAILED", server);

  await expect
    .element(
      screen.getByRole("heading", { name: "No jobs match these filters" }),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "Clear the filters" }).click();
  await expect.poll(() => lastQuery(asked)).not.toHaveProperty("q");
  await expect.poll(() => lastQuery(asked)).not.toHaveProperty("state");
});
