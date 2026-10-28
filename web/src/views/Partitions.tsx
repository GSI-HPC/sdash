// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";

import { client } from "../client/client";
import { DataAge } from "../cluster/DataAge";
import { failureOf } from "../cluster/failure";
import { generationOf, useAddressOf, usePulse } from "../cluster/useCluster";
import { useFollow } from "../cluster/useFollow";
import { PageHeader } from "../layout/PageHeader";
import { viewOf } from "../routing/views";
import { Banner } from "../primitives/Banner";
import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";
import { Table } from "../primitives/Table";
import { Stale, Unready } from "./Fetching";
import { partitionColumns } from "./partitions/columns";
import { WithCluster } from "./WithCluster";

/**
 * The Partitions view: the partitions of the cluster in a table, with the
 * states of their nodes, the CPUs allocated in them and their jobs
 * (doc/adr/0036-the-cluster-views-on-real-data.md).
 */
export function Partitions() {
  const { title, summary } = viewOf("partitions");

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <WithCluster>
        {(cluster) => <PartitionsOf cluster={cluster} />}
      </WithCluster>
    </div>
  );
}

/**
 * The query of the jobs the view counts by partition: the counts come
 * with any page of jobs, so it asks for the shortest.
 */
const countsOnly = { limit: 1 } as const;

/**
 * The partitions of one cluster. The table needs the partitions; the
 * states of the nodes, the CPUs allocated and the jobs come from the nodes
 * and the jobs, and fill their columns as they arrive.
 */
function PartitionsOf({ cluster }: { cluster: string }) {
  const addressOf = useAddressOf();
  const pulse = usePulse(cluster, viewOf("partitions").kinds);
  const partitions = useQuery({
    queryKey: ["partitions", cluster],
    queryFn: ({ signal }) => client.getPartitions(cluster, { signal }),
  });
  const nodes = useQuery({
    queryKey: ["nodes", cluster],
    queryFn: ({ signal }) => client.getNodes(cluster, { signal }),
  });
  const jobs = useQuery({
    queryKey: ["jobs", cluster, countsOnly],
    queryFn: ({ signal }) => client.getJobs(cluster, countsOnly, { signal }),
  });
  useFollow(partitions, generationOf(pulse.data, "partitions"));
  useFollow(nodes, generationOf(pulse.data, "nodes"));
  useFollow(jobs, generationOf(pulse.data, "jobs"));

  const list = partitions.data;
  const lacking = [
    ...(nodes.isError && nodes.data === undefined
      ? [{ what: "nodes", error: nodes.error }]
      : []),
    ...(jobs.isError && jobs.data === undefined
      ? [{ what: "jobs", error: jobs.error }]
      : []),
  ];

  return (
    <>
      <p role="status" className="text-xs text-t2">
        {list !== undefined && (
          <>
            {list.rows.length === 1
              ? "1 partition"
              : `${String(list.rows.length)} partitions`}
            {", "}
            <DataAge fetchedAt={list.fetchedAt} />
          </>
        )}
      </p>
      <Stale error={list?.error} what="The partitions shown" />
      {lacking.map(({ what, error }) => {
        const failed = failureOf(error);
        return (
          <Banner
            key={what}
            tone="err"
            title={failed.title}
            {...(failed.code === undefined ? {} : { code: failed.code })}
          >
            {`The ${what} could not be read, and the columns that need them stay empty. ${failed.text}`}
          </Banner>
        );
      })}
      <Card flush>
        {list === undefined ? (
          <Unready
            error={partitions.error}
            what="the partitions"
            level={2}
            onRetry={() => {
              void partitions.refetch();
            }}
            className="px-4 py-3.5"
          />
        ) : list.rows.length === 0 ? (
          <EmptyState title="No partitions" level={2} className="px-4 py-8">
            {`slurmctld knows of no partition on ${cluster}.`}
          </EmptyState>
        ) : (
          <Table
            label={`Partitions of ${cluster}`}
            columns={partitionColumns(addressOf)}
            rows={list.rows.map((partition) => ({
              partition,
              nodes: nodes.data?.rows.filter((node) =>
                node.partitions.includes(partition.name),
              ),
              jobs:
                jobs.data === undefined
                  ? undefined
                  : (jobs.data.facets.partitions.find(
                      (facet) => facet.value === partition.name,
                    )?.count ?? 0),
            }))}
            rowKey={({ partition }) => partition.name}
          />
        )}
      </Card>
    </>
  );
}
