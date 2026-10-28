// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The data of a made-up cluster for the component tests of the views of
// cluster data, in the shapes of sdash's own API: api/openapi.yaml holds
// them to those shapes, and no shape of slurmrestd's reaches the browser
// (doc/adr/0034-cluster-data-in-the-browser-api.md). Only tests import it.

import type {
  JobList,
  NodeList,
  PartitionList,
  Pulse,
  ReservationList,
} from "../client/client";
import { type Answer, type Server, status } from "./app";

/** When the data of the cluster were fetched. */
export const fetchedAt = "2026-01-01T12:00:00Z";

/** One node of the cluster. */
export type Node = NodeList["rows"][number];

/** A node of the partition main, idle, with 8 CPUs and 2 GB, and what else is given. */
export function node(name: string, more: Partial<Node> = {}): Node {
  return {
    name,
    state: "IDLE",
    flags: [],
    partitions: ["main"],
    features: [],
    cpus: 8,
    allocCpus: 0,
    load: 0,
    memory: 2048,
    allocMemory: 0,
    ...more,
  };
}

/** Four nodes: two of main, one allocated and one idle, and two of gpu, one mixed and one drained. */
export const nodes: NodeList = {
  generation: 1,
  fetchedAt,
  rows: [
    node("cpu-1", { state: "ALLOCATED", allocCpus: 8, allocMemory: 2048 }),
    node("cpu-2"),
    node("gpu-1", {
      state: "MIXED",
      allocCpus: 4,
      allocMemory: 1024,
      partitions: ["gpu"],
    }),
    node("gpu-2", {
      flags: ["DRAIN"],
      reason: "bad disk",
      partitions: ["gpu"],
    }),
  ],
};

/** The partitions main, up, and gpu, drained. */
export const partitions: PartitionList = {
  generation: 1,
  fetchedAt,
  rows: [
    {
      name: "main",
      state: "UP",
      nodes: "cpu-[1-2]",
      nodeCount: 2,
      cpus: 16,
      maxTime: 1440,
      defaultTime: 60,
      priorityTier: 1,
      qos: "normal",
    },
    {
      name: "gpu",
      state: "DRAIN",
      nodes: "gpu-[1-2]",
      nodeCount: 2,
      cpus: 16,
      maxNodes: 1,
      priorityTier: 2,
    },
  ],
};

/** A page of jobs that holds none, with the counts of five: three running and two pending, two of them alice's. */
export const jobCounts: JobList = {
  generation: 1,
  fetchedAt,
  total: 5,
  rows: [],
  facets: {
    states: [
      { value: "RUNNING", count: 3 },
      { value: "PENDING", count: 2 },
    ],
    users: [
      { value: "bob", count: 3 },
      { value: "alice", count: 2 },
    ],
    partitions: [
      { value: "main", count: 4 },
      { value: "gpu", count: 1 },
    ],
  },
};

/**
 * The reservations: one for maintenance tomorrow, one held daily that is
 * active now, and one in a month without an end, beyond the timeline.
 */
export const reservations: ReservationList = {
  generation: 1,
  fetchedAt,
  rows: [
    {
      name: "maintenance",
      nodes: "gpu-[1-2]",
      nodeCount: 2,
      cores: 8,
      startTime: "2026-01-02T08:00:00Z",
      endTime: "2026-01-02T12:00:00Z",
      flags: ["MAINT", "SPEC_NODES"],
      users: ["root"],
      accounts: [],
      groups: [],
      tres: "cpu=8",
    },
    {
      name: "course",
      nodes: "cpu-1",
      nodeCount: 1,
      cores: 8,
      startTime: "2025-12-31T09:00:00Z",
      endTime: "2026-01-01T17:00:00Z",
      flags: ["DAILY"],
      users: [],
      accounts: ["physics", "-guests"],
      groups: [],
      partition: "main",
    },
    {
      name: "later",
      nodes: "cpu-2",
      nodeCount: 1,
      cores: 8,
      startTime: "2026-02-01T00:00:00Z",
      flags: [],
      users: ["alice"],
      accounts: [],
      groups: [],
    },
  ],
};

/** The pulse of a cluster that is connected, as alice, with the kinds asked for. */
export function pulseOf(url: URL): Pulse {
  return {
    connection: {
      connected: true,
      release: "1.2.3",
      parser: "v1",
      tested: true,
      user: "alice",
    },
    kinds: url.searchParams.getAll("kinds").map((kind) => ({
      kind: kind as Pulse["kinds"][number]["kind"],
      generation: 1,
      fetchedAt,
      period: 30,
    })),
  };
}

/** A status that names the clusters virgo and lyra. */
export const twoClusters = {
  ...status,
  clusters: [
    { name: "virgo", endpoint: "https://virgo.example:6820" },
    { name: "lyra", endpoint: "https://lyra.example:6820" },
  ],
};

/** What a cluster's server answers, each in place of the data above. */
export interface ClusterAnswers {
  readonly pulse?: (url: URL) => Answer;
  readonly nodes?: Answer;
  readonly partitions?: Answer;
  readonly jobs?: Answer;
  readonly reservations?: Answer;
}

/**
 * A server with the clusters virgo and lyra, both of which answer with
 * the data above unless told otherwise. Every request for the data of a
 * cluster is kept in `asked`.
 */
export function clusterServer(answers: ClusterAnswers = {}): {
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
      if (!url.pathname.startsWith("/api/v1/clusters/")) {
        return undefined;
      }
      asked.push(url);
      if (url.pathname.endsWith("/pulse")) {
        return answers.pulse?.(url) ?? { body: pulseOf(url) };
      }
      if (url.pathname.endsWith("/nodes")) {
        return answers.nodes ?? { body: nodes };
      }
      if (url.pathname.endsWith("/partitions")) {
        return answers.partitions ?? { body: partitions };
      }
      if (url.pathname.endsWith("/jobs")) {
        return answers.jobs ?? { body: jobCounts };
      }
      if (url.pathname.endsWith("/reservations")) {
        return answers.reservations ?? { body: reservations };
      }
      return undefined;
    },
  };
}
