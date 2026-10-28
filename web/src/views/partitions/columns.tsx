// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";

import type { PartitionList } from "../../client/client";
import { Badge, type BadgeTone } from "../../primitives/Badge";
import { Meter } from "../../primitives/Meter";
import { StackedBar } from "../../primitives/StackedBar";
import type { TableColumn } from "../../primitives/Table";
import { duration } from "../jobs/format";
import { countStates, type Node, toneOf, wordOf } from "../nodes/nodes";

/** One partition of a cluster. */
export type Partition = PartitionList["rows"][number];

/** A partition with what the other kinds of data say of it. */
export interface PartitionRow {
  readonly partition: Partition;
  /** Its nodes; undefined while the nodes have not come. */
  readonly nodes: readonly Node[] | undefined;
  /** How many jobs are in it; undefined while the jobs have not come. */
  readonly jobs: number | undefined;
}

/** The tone of the state of a partition. */
export function partitionTone(state: string): BadgeTone {
  switch (state) {
    case "UP":
      return "ok";
    case "DRAIN":
      return "warn";
    case "DOWN":
      return "err";
    default:
      return "neutral";
  }
}

/** A time of a partition, given in minutes, as Slurm's tools write it. */
function minutes(value: number | undefined, none: string): string {
  return value === undefined ? none : duration(value * 60);
}

/**
 * The columns of the table of partitions, after the handoff's. The name
 * leads to the nodes of the partition and the count of its jobs to its
 * jobs; `addressOf` gives the address of a view with its filters.
 */
export function partitionColumns(
  addressOf: (path: string, more?: Readonly<Record<string, string>>) => string,
): readonly TableColumn<PartitionRow>[] {
  return [
    {
      id: "name",
      header: "Partition",
      cell: ({ partition }) => (
        <span className="flex flex-col gap-0.5">
          <Link
            to={addressOf("/nodes", { partition: partition.name })}
            className="font-semibold"
          >
            {partition.name}
          </Link>
          <span className="font-mono text-[0.6875rem] text-t3">
            {partition.nodes}
          </span>
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: ({ partition }) => (
        <Badge tone={partitionTone(partition.state)} size="sm" dot>
          {partition.state}
        </Badge>
      ),
    },
    {
      id: "nodes",
      header: "Nodes",
      cell: ({ partition, nodes }) =>
        nodes === undefined ? (
          String(partition.nodeCount)
        ) : (
          <StackedBar
            label={`States of the ${String(partition.nodeCount)} nodes of ${partition.name}`}
            parts={[...countStates(nodes)].map(([state, count]) => ({
              label: wordOf(state),
              value: count,
              tone: toneOf(state),
            }))}
            size="sm"
            className="min-w-40"
          />
        ),
    },
    {
      id: "cpus",
      header: "CPUs allocated",
      cell: ({ partition, nodes }) => {
        if (nodes === undefined) {
          return "";
        }
        const allocated = nodes.reduce((sum, node) => sum + node.allocCpus, 0);
        return (
          <span className="flex min-w-32 flex-col gap-1">
            <span className="font-mono text-xs">
              {`${String(allocated)} of ${String(partition.cpus)}`}
            </span>
            <Meter
              label={`CPUs allocated in ${partition.name}`}
              value={allocated}
              max={partition.cpus}
              format={(value) =>
                `${String(value)} of ${String(partition.cpus)}`
              }
              size="sm"
              layout="bare"
            />
          </span>
        );
      },
    },
    {
      id: "time",
      header: "Time limit and default",
      cell: ({ partition }) =>
        `${minutes(partition.maxTime, "no limit")} / ${minutes(partition.defaultTime, "none")}`,
      mono: true,
    },
    {
      id: "tier",
      header: "Priority tier",
      cell: ({ partition }) => String(partition.priorityTier),
      align: "end",
      mono: true,
    },
    {
      id: "qos",
      header: "QOS",
      cell: ({ partition }) => partition.qos ?? "",
    },
    {
      id: "maxNodes",
      header: "Nodes per job",
      cell: ({ partition }) =>
        partition.maxNodes === undefined
          ? "no limit"
          : String(partition.maxNodes),
      align: "end",
      mono: true,
    },
    {
      id: "jobs",
      header: "Jobs",
      cell: ({ partition, jobs }) =>
        jobs === undefined ? (
          ""
        ) : (
          <Link
            to={addressOf("/jobs", { partition: partition.name })}
            aria-label={`${String(jobs)} jobs in ${partition.name}`}
          >
            {String(jobs)}
          </Link>
        ),
      align: "end",
      mono: true,
    },
  ];
}
