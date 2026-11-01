// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { client, type Job, JobSortKey } from "../../client/client";
import { generationOf, useAddressOf, usePulse } from "../../cluster/useCluster";
import { useFollow } from "../../cluster/useFollow";
import { Badge } from "../../primitives/Badge";
import { Banner } from "../../primitives/Banner";
import { Drawer, DrawerBody, DrawerHeader } from "../../primitives/Drawer";
import { EmptyState } from "../../primitives/EmptyState";
import { Heading } from "../../primitives/Heading";
import { type KVItem, KVList } from "../../primitives/KVList";
import { Meter } from "../../primitives/Meter";
import { Table, type TableColumn } from "../../primitives/Table";
import { Unready } from "../Fetching";
import { stateOf as jobStateOf, toneOf as jobToneOf } from "../jobs/format";
import { timeOf } from "../moments";
import { memory, type Node, stateOf, toneOf, wordOf } from "./nodes";

/** How many of the jobs of a node the drawer lists, the newest first. */
export const nodeJobsShown = 20;

/** The kinds the list of the jobs of a node follows. */
const jobKinds = ["jobs"] as const;

/** The props of the drawer of a node. */
export interface NodeDrawerProps {
  cluster: string;
  /** The name of the node shown; empty while the drawer is closed. */
  name: string;
  /** The nodes of the cluster the node is one of, and when they were fetched. */
  nodes: readonly Node[];
  fetchedAt: string;
  onClose: () => void;
}

/**
 * The drawer of one node: what it holds and how much of it is in use, why
 * it is drained or down, what it is, and the jobs slurmctld knows of on it
 * (doc/adr/0039-the-job-and-node-drawers.md).
 *
 * The node is one of the nodes the view shows, and changes with them; its
 * jobs are a page of the jobs that have it. While the drawer slides out
 * it keeps showing the node it showed.
 */
export function NodeDrawer({
  cluster,
  name,
  nodes,
  fetchedAt,
  onClose,
}: NodeDrawerProps) {
  const [shown, setShown] = useState(name);
  if (name !== "" && name !== shown) {
    setShown(name);
  }
  const node = nodes.find((each) => each.name === shown);

  return (
    <Drawer open={name !== ""} onClose={onClose}>
      {shown !== "" &&
        (node === undefined ? (
          <>
            <DrawerHeader eyebrow="Node" title={shown} />
            <DrawerBody>
              <EmptyState title="No such node" level={3}>
                {`slurmctld knows of no node ${shown} on ${cluster}.`}
              </EmptyState>
            </DrawerBody>
          </>
        ) : (
          <NodeOf cluster={cluster} node={node} fetchedAt={fetchedAt} />
        ))}
    </Drawer>
  );
}

/** The header and the body of the drawer of a node. */
function NodeOf({
  cluster,
  node,
  fetchedAt,
}: {
  cluster: string;
  node: Node;
  fetchedAt: string;
}) {
  const state = stateOf(node);
  const at = new Date(fetchedAt);
  const items: (KVItem | false)[] = [
    { term: "Partitions", value: node.partitions.join(", ") },
    node.features.length > 0 && {
      term: "Features",
      value: node.features.join(", "),
    },
    node.gres !== undefined && { term: "Generic resources", value: node.gres },
    node.tres !== undefined && {
      term: "Trackable resources",
      value: node.tres,
    },
    node.reservation !== undefined && {
      term: "Reservation",
      value: node.reservation,
    },
    node.architecture !== undefined && {
      term: "Architecture",
      value: node.architecture,
    },
    node.operatingSystem !== undefined && {
      term: "Operating system",
      value: node.operatingSystem,
    },
    node.bootTime !== undefined && {
      term: "Booted",
      value: timeOf(node.bootTime, "", at),
      mono: false,
    },
    node.lastBusy !== undefined && {
      term: "Last busy",
      value: timeOf(node.lastBusy, "", at),
      mono: false,
    },
  ];

  return (
    <>
      <DrawerHeader
        eyebrow="Node"
        title={node.name}
        meta={
          <>
            <Badge tone={toneOf(state)} dot>
              {wordOf(state)}
            </Badge>
            {node.flags.length > 0 && <span>{node.flags.join(", ")}</span>}
          </>
        }
      />
      <DrawerBody className="flex flex-col gap-5">
        {node.reason !== undefined && node.reason !== "" && (
          <Banner tone={state === "DOWN" ? "err" : "warn"} title={node.reason}>
            {[
              node.reasonSetBy === undefined
                ? ""
                : `Set by ${node.reasonSetBy}`,
              node.reasonTime === undefined
                ? ""
                : `on ${timeOf(node.reasonTime, "", at)}`,
            ]
              .filter((part) => part !== "")
              .join(" ")}
          </Banner>
        )}
        <div className="flex flex-col gap-3">
          <Meter
            label="CPUs allocated"
            value={node.allocCpus}
            max={node.cpus}
            format={(value) => `${String(value)} of ${String(node.cpus)}`}
            size="sm"
            layout="inline"
          />
          <Meter
            label="Memory allocated"
            value={node.allocMemory}
            max={node.memory}
            format={(value) => `${memory(value)} of ${memory(node.memory)}`}
            size="sm"
            layout="inline"
          />
          <Meter
            label="Load average"
            value={node.load}
            max={Math.max(node.cpus, 1)}
            format={(value) =>
              `${value.toFixed(2)} on ${String(node.cpus)} CPUs`
            }
            size="sm"
            layout="inline"
          />
        </div>
        <KVList
          items={items.filter((item): item is KVItem => item !== false)}
        />
        <NodeJobs cluster={cluster} node={node.name} />
      </DrawerBody>
    </>
  );
}

/**
 * The jobs slurmctld knows of on a node, the newest first: those that run
 * there and those that ran there and have not been forgotten yet.
 */
function NodeJobs({ cluster, node }: { cluster: string; node: string }) {
  const addressOf = useAddressOf();
  // The jobs are followed while the drawer shows them, and not by the
  // view, whose map shows nothing of them.
  const pulse = usePulse(cluster, jobKinds);
  const query = {
    node,
    sort: JobSortKey.ID,
    order: "desc",
    offset: 0,
    limit: nodeJobsShown,
  } as const;
  const jobs = useQuery({
    queryKey: ["jobs", cluster, query],
    queryFn: ({ signal }) => client.getJobs(cluster, query, { signal }),
  });
  useFollow(jobs, generationOf(pulse.data, "jobs"));

  const columns: readonly TableColumn<Job>[] = [
    {
      id: "id",
      header: "Job ID",
      cell: (job) => (
        <Link to={addressOf("/jobs", { job: String(job.id) })}>
          {job.displayId}
        </Link>
      ),
      mono: true,
    },
    { id: "name", header: "Name", cell: (job) => job.name },
    { id: "user", header: "User", cell: (job) => job.user },
    {
      id: "state",
      header: "State",
      cell: (job) => (
        <Badge tone={jobToneOf(jobStateOf(job))} size="sm" dot>
          {jobStateOf(job)}
        </Badge>
      ),
    },
  ];

  const list = jobs.data;
  return (
    <section className="flex flex-col gap-1.5">
      <Heading level={3} className="text-xs font-semibold text-t2">
        {list === undefined || list.total <= list.rows.length
          ? "Jobs"
          : `Jobs, the newest ${String(list.rows.length)} of ${String(list.total)}`}
      </Heading>
      {list === undefined ? (
        <Unready
          error={jobs.error}
          what="the jobs of the node"
          level={4}
          lines={2}
          onRetry={() => {
            void jobs.refetch();
          }}
        />
      ) : list.rows.length === 0 ? (
        <p className="text-t2">No job runs or ran on this node.</p>
      ) : (
        <div className="rounded-md border border-bd">
          <Table
            label={`Jobs on ${node}`}
            columns={columns}
            rows={list.rows}
            rowKey={(job) => String(job.id)}
          />
        </div>
      )}
    </section>
  );
}
