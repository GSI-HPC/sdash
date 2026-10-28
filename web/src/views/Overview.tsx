// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { client, type Pulse } from "../client/client";
import { statusQuery } from "../client/query";
import { healthOf } from "../cluster/health";
import { generationOf, useAddressOf, usePulse } from "../cluster/useCluster";
import { useFollow, useUser } from "../cluster/useFollow";
import { PageHeader } from "../layout/PageHeader";
import { viewOf } from "../routing/views";
import { Card } from "../primitives/Card";
import { CellGrid } from "../primitives/CellGrid";
import { EmptyState } from "../primitives/EmptyState";
import { KVList } from "../primitives/KVList";
import { Meter } from "../primitives/Meter";
import { StackedBar } from "../primitives/StackedBar";
import { StatCard } from "../primitives/StatCard";
import { StatusSummary } from "../status/StatusSummary";
import { Stale, Unready } from "./Fetching";
import {
  cellOf,
  countStates,
  memory,
  nodeStates,
  toneOf,
  wordOf,
} from "./nodes/nodes";
import { WithCluster } from "./WithCluster";

/**
 * The Overview, the view sdash starts with: the cluster at a glance, and
 * which sdash is running (doc/adr/0036-the-cluster-views-on-real-data.md).
 */
export function Overview() {
  const { title, summary } = viewOf("overview");

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <WithCluster>{(cluster) => <OverviewOf cluster={cluster} />}</WithCluster>
      <StatusSummary />
    </div>
  );
}

/**
 * The query of the jobs the Overview counts: the counts come with any
 * page of jobs, so it asks for the shortest.
 */
const countsOnly = { limit: 1 } as const;

const british = new Intl.NumberFormat("en-GB");

/** A count in words, with the separators of British English. */
function count(value: number): string {
  return british.format(value);
}

/** A share as a whole percentage, of a whole that may be nothing. */
function share(part: number, whole: number): string {
  return `${String(whole === 0 ? 0 : Math.round((part / whole) * 100))}%`;
}

/**
 * The cards of one cluster: its nodes, the CPUs and memory allocated, its
 * jobs, its partitions, its connection, and a map of its nodes. Each card
 * fills as its data arrive, and says why where they do not.
 */
function OverviewOf({ cluster }: { cluster: string }) {
  const addressOf = useAddressOf();
  const pulse = usePulse(cluster, viewOf("overview").kinds);
  const nodes = useQuery({
    queryKey: ["nodes", cluster],
    queryFn: ({ signal }) => client.getNodes(cluster, { signal }),
  });
  const partitions = useQuery({
    queryKey: ["partitions", cluster],
    queryFn: ({ signal }) => client.getPartitions(cluster, { signal }),
  });
  const jobs = useQuery({
    queryKey: ["jobs", cluster, countsOnly],
    queryFn: ({ signal }) => client.getJobs(cluster, countsOnly, { signal }),
  });
  useFollow(nodes, generationOf(pulse.data, "nodes"));
  useFollow(partitions, generationOf(pulse.data, "partitions"));
  const me = useUser(pulse, useFollow(jobs, generationOf(pulse.data, "jobs")));

  const all = nodes.data?.rows;
  const counts = countStates(all ?? []);
  const cpus = (all ?? []).reduce((sum, node) => sum + node.cpus, 0);
  const allocCpus = (all ?? []).reduce((sum, node) => sum + node.allocCpus, 0);
  const mem = (all ?? []).reduce((sum, node) => sum + node.memory, 0);
  const allocMem = (all ?? []).reduce((sum, node) => sum + node.allocMemory, 0);
  const jobStates = jobs.data?.facets.states ?? [];
  const jobsIn = (state: string) =>
    jobStates.find((facet) => facet.value === state)?.count ?? 0;
  const mine =
    me === undefined
      ? undefined
      : (jobs.data?.facets.users.find((facet) => facet.value === me)?.count ??
        0);
  const retry = (query: { refetch: () => Promise<unknown> }) => () => {
    void query.refetch();
  };

  return (
    <>
      <Stale error={nodes.data?.error} what="The nodes shown" />
      <Stale error={jobs.data?.error} what="The jobs counted" />
      <Stale error={partitions.data?.error} what="The partitions shown" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14.375rem,1fr))] gap-3">
        {all === undefined ? (
          <Card title="Nodes">
            <Unready
              error={nodes.error}
              what="the nodes"
              level={3}
              onRetry={retry(nodes)}
            />
          </Card>
        ) : (
          <>
            <StatCard
              label="Nodes"
              value={count(all.length)}
              aside={`${count(counts.get("IDLE") ?? 0)} idle`}
            >
              <StackedBar
                label="States of the nodes"
                parts={[...counts].map(([state, n]) => ({
                  label: wordOf(state),
                  value: n,
                  tone: toneOf(state),
                }))}
              />
            </StatCard>
            <StatCard
              label="CPUs allocated"
              value={share(allocCpus, cpus)}
              aside={`${count(allocCpus)} of ${count(cpus)}`}
            >
              <Meter
                label="CPUs allocated"
                value={allocCpus}
                max={cpus}
                layout="bare"
              />
              <Meter
                label="Memory allocated"
                value={allocMem}
                max={mem}
                format={(value) => `${memory(value)} of ${memory(mem)}`}
                size="sm"
                layout="inline"
              />
            </StatCard>
          </>
        )}
        {jobs.data === undefined ? (
          <Card title="Jobs">
            <Unready
              error={jobs.error}
              what="the jobs"
              level={3}
              onRetry={retry(jobs)}
            />
          </Card>
        ) : (
          <StatCard
            label="Jobs"
            value={count(jobsIn("RUNNING"))}
            unit="running"
            aside={<Link to={addressOf("/jobs")}>All jobs</Link>}
            detail={[
              `${count(jobsIn("PENDING"))} pending`,
              ...(mine === undefined ? [] : [`${count(mine)} yours`]),
              `${count(jobs.data.total)} in all`,
            ].join(", ")}
          />
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(18.75rem,1fr))] gap-3">
        <Card
          title="CPUs allocated by partition"
          action={<Link to={addressOf("/partitions")}>All partitions</Link>}
        >
          {partitions.data === undefined ? (
            <Unready
              error={partitions.error}
              what="the partitions"
              level={3}
              onRetry={retry(partitions)}
            />
          ) : partitions.data.rows.length === 0 ? (
            <EmptyState title="No partitions" level={3}>
              {`slurmctld knows of no partition on ${cluster}.`}
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2.5">
              {partitions.data.rows.map((partition) => {
                const allocated = (all ?? [])
                  .filter((node) => node.partitions.includes(partition.name))
                  .reduce((sum, node) => sum + node.allocCpus, 0);
                return (
                  <Meter
                    key={partition.name}
                    label={partition.name}
                    value={allocated}
                    max={partition.cpus}
                    format={(value) =>
                      `${count(value)} of ${count(partition.cpus)}`
                    }
                    size="sm"
                    layout="inline"
                  />
                );
              })}
            </div>
          )}
        </Card>
        <Connection cluster={cluster} pulse={pulse.data} />
      </div>
      <Card
        title="Map of the nodes"
        action={<Link to={addressOf("/nodes")}>All nodes</Link>}
      >
        {all === undefined ? (
          <Unready
            error={nodes.error}
            what="the nodes"
            level={3}
            onRetry={retry(nodes)}
          />
        ) : (
          <CellGrid
            label={`Nodes of ${cluster}`}
            cells={all.map((node) => cellOf(node))}
            tones={nodeStates.map(({ tone, label }) => ({ tone, label }))}
            emptyText={`slurmctld knows of no node on ${cluster}.`}
          />
        )}
      </Card>
    </>
  );
}

/**
 * The connection to the cluster's slurmrestd: its state, as the status
 * pill says it in a word, and what sdash knows of the other side.
 */
function Connection({
  cluster,
  pulse,
}: {
  cluster: string;
  pulse: Pulse | undefined;
}) {
  const status = useQuery(statusQuery);
  const endpoint = status.data?.clusters.find(
    (each) => each.name === cluster,
  )?.endpoint;
  const connection = pulse?.connection;
  const health = pulse === undefined ? undefined : healthOf(pulse);

  return (
    <Card title="Connection">
      <KVList
        items={[
          {
            term: "State",
            value:
              health === undefined
                ? "Not known yet"
                : `${health.word}: ${health.text}`,
            mono: false,
          },
          { term: "slurmrestd", value: endpoint ?? "" },
          { term: "Slurm release", value: connection?.release ?? "" },
          { term: "data_parser", value: connection?.parser ?? "" },
          {
            term: "Tested on this release line",
            value:
              connection?.tested === undefined
                ? ""
                : connection.tested
                  ? "Yes"
                  : "No, spoken to as the newest line sdash knows",
            mono: false,
          },
          {
            term: "User of the token",
            value: connection?.user ?? "",
          },
        ]}
      />
    </Card>
  );
}
