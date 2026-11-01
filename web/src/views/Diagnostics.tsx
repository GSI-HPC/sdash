// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";

import { type Diagnostics as DiagnosticsData, client } from "../client/client";
import { DataAge } from "../cluster/DataAge";
import { generationOf, usePulse } from "../cluster/useCluster";
import { useFollow } from "../cluster/useFollow";
import { PageHeader } from "../layout/PageHeader";
import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";
import { KVList } from "../primitives/KVList";
import { Meter } from "../primitives/Meter";
import { StatCard } from "../primitives/StatCard";
import { Table, type TableColumn } from "../primitives/Table";
import { viewOf } from "../routing/views";
import { count, micros, shareOfBusiest } from "./diagnostics/diagnostics";
import { timeOf } from "./reservations/reservations";
import { Stale, Unready } from "./Fetching";
import { WithCluster } from "./WithCluster";

/**
 * The Diagnostics view: what the scheduler reports about itself, as sdiag
 * prints it (doc/adr/0038-the-diagnostics-view.md).
 */
export function Diagnostics() {
  const { title, summary } = viewOf("diagnostics");

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <WithCluster>
        {(cluster) => <DiagnosticsOf cluster={cluster} />}
      </WithCluster>
    </div>
  );
}

/** The columns of a table of the calls slurmctld had, by `kind` of caller. */
function rpcColumns(
  kind: string,
  rows: DiagnosticsData["rpcsByType"],
): readonly TableColumn<DiagnosticsData["rpcsByType"][number]>[] {
  return [
    {
      id: "name",
      header: kind,
      mono: kind === "Message type",
      cell: (row) => row.name,
    },
    {
      id: "share",
      header: "Share of the busiest",
      cell: (row) => (
        <Meter
          label={`Calls of ${row.name}`}
          value={shareOfBusiest(row, rows)}
          max={1}
          format={() => count(row.count)}
          size="sm"
          layout="inline"
        />
      ),
    },
    {
      id: "count",
      header: "Calls",
      align: "end",
      cell: (row) => count(row.count),
    },
    {
      id: "mean",
      header: "Mean",
      align: "end",
      mono: true,
      cell: (row) => micros(row.mean),
    },
    {
      id: "total",
      header: "Total",
      align: "end",
      mono: true,
      cell: (row) => micros(row.total),
    },
  ];
}

/** The diagnostics of one cluster. */
function DiagnosticsOf({ cluster }: { cluster: string }) {
  const pulse = usePulse(cluster, viewOf("diagnostics").kinds);
  const diagnostics = useQuery({
    queryKey: ["diagnostics", cluster],
    queryFn: ({ signal }) => client.getDiagnostics(cluster, { signal }),
  });
  useFollow(diagnostics, generationOf(pulse.data, "diagnostics"));

  const d = diagnostics.data;

  return (
    <>
      <p role="status" className="text-xs text-t2">
        {d !== undefined && (
          <>
            {d.since === undefined
              ? "Counters reset at a time not known"
              : `Counters reset ${timeOf(d.since, "")}`}
            {", "}
            <DataAge fetchedAt={d.fetchedAt} />
          </>
        )}
      </p>
      <Stale error={d?.error} what="The diagnostics shown" />
      {d === undefined ? (
        <Card flush>
          <Unready
            error={diagnostics.error}
            what="the diagnostics"
            level={2}
            onRetry={() => {
              void diagnostics.refetch();
            }}
            className="px-4 py-3.5"
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(8.125rem,1fr))] gap-3">
            <StatCard label="Submitted" value={count(d.jobs.submitted)} />
            <StatCard label="Started" value={count(d.jobs.started)} />
            <StatCard label="Completed" value={count(d.jobs.completed)} />
            <StatCard label="Canceled" value={count(d.jobs.canceled)} />
            <StatCard label="Failed" value={count(d.jobs.failed)} />
            <StatCard label="Running now" value={count(d.jobs.running)} />
            <StatCard label="Pending now" value={count(d.jobs.pending)} />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(17.5rem,1fr))] gap-3">
            <Card title="slurmctld">
              <KVList
                items={[
                  { term: "Server threads", value: count(d.serverThreads) },
                  { term: "Agent queue size", value: count(d.agentQueue) },
                  { term: "DBD agent queue", value: count(d.dbdAgentQueue) },
                  {
                    term: "1000 clock reads",
                    value: micros(d.clockCost),
                  },
                ]}
              />
            </Card>
            <Card title="Main scheduler">
              <KVList
                items={[
                  { term: "Last cycle", value: micros(d.main.lastCycle) },
                  { term: "Max cycle", value: micros(d.main.maxCycle) },
                  { term: "Mean cycle", value: micros(d.main.meanCycle) },
                  { term: "Cycles", value: count(d.main.cycles) },
                  { term: "Mean depth", value: count(d.main.meanDepth) },
                  {
                    term: "Cycles per minute",
                    value: count(d.main.cyclesPerMinute),
                  },
                  { term: "Queue length", value: count(d.main.queueLength) },
                ]}
              />
            </Card>
            <Card title="Backfill scheduler">
              <KVList
                items={[
                  {
                    term: "Status",
                    value: d.backfill.active ? "Running a cycle" : "Idle",
                    mono: false,
                  },
                  { term: "Last cycle", value: micros(d.backfill.lastCycle) },
                  { term: "Max cycle", value: micros(d.backfill.maxCycle) },
                  { term: "Mean cycle", value: micros(d.backfill.meanCycle) },
                  {
                    term: "Last depth (tried)",
                    value: `${count(d.backfill.lastDepth)} (${count(d.backfill.lastTried)})`,
                  },
                  {
                    term: "Backfilled since the reset",
                    value: count(d.backfill.backfilledSinceReset),
                  },
                  {
                    term: "Backfilled since the start",
                    value: count(d.backfill.backfilled),
                  },
                  {
                    term: "Last cycle at",
                    value: timeOf(d.backfill.lastCycleAt, "None yet"),
                    mono: false,
                  },
                ]}
              />
            </Card>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(26.25rem,1fr))] gap-3">
            <RpcCard
              title="RPCs by message type"
              label="Calls by message type"
              kind="Message type"
              rows={d.rpcsByType}
            />
            <RpcCard
              title="RPCs by user"
              label="Calls by user"
              kind="User"
              rows={d.rpcsByUser}
            />
          </div>
        </>
      )}
    </>
  );
}

function RpcCard({
  title,
  label,
  kind,
  rows,
}: {
  title: string;
  /** The name of the table, which differs from the title of its card: two regions of one name are one too many. */
  label: string;
  kind: string;
  rows: DiagnosticsData["rpcsByType"];
}) {
  return (
    <Card title={title} flush>
      {rows.length === 0 ? (
        <EmptyState title="No calls" level={3} className="px-4 py-8">
          slurmctld has counted none since the reset.
        </EmptyState>
      ) : (
        <Table
          label={label}
          columns={rpcColumns(kind, rows)}
          rows={rows}
          rowKey={(row) => row.name}
        />
      )}
    </Card>
  );
}
