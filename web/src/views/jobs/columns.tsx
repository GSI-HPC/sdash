// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { Job } from "../../client/client";
import { Badge } from "../../primitives/Badge";
import type { TableColumn } from "../../primitives/Table";
import { duration, elapsed, limit, toneOf } from "./format";

/**
 * The state a job shows: COMPLETING, a flag of a job that has ended and
 * still holds its nodes, where it has that flag, and its base state
 * otherwise.
 */
function stateOf(job: Job): string {
  return job.flags.includes("COMPLETING") ? "COMPLETING" : job.state;
}

/**
 * The columns of the table of jobs, after the handoff's. The id of a
 * column that sorts is the key the server sorts by. `user` is the user the
 * token names, whose jobs say "you"; `at` is when the jobs were fetched,
 * the moment the time of a running job is counted to, so that the table
 * shows one moment and the age beside it says which.
 */
export function jobColumns(
  user: string | undefined,
  at: Date,
): readonly TableColumn<Job>[] {
  return [
    {
      id: "id",
      header: "Job ID",
      cell: (job) => job.displayId,
      mono: true,
      sortable: true,
      firstOrder: "desc",
    },
    {
      id: "name",
      header: "Name",
      cell: (job) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          {job.name}
          {job.arrayJobId !== undefined && (
            <Badge tone="vio" size="sm">
              Array
            </Badge>
          )}
        </span>
      ),
      sortable: true,
    },
    {
      id: "user",
      header: "User",
      cell: (job) => (
        <span className="inline-flex items-center gap-1.5">
          {job.user}
          {job.user === user && (
            <Badge tone="accent" size="sm">
              you
            </Badge>
          )}
        </span>
      ),
      sortable: true,
    },
    {
      id: "account",
      header: "Account",
      cell: (job) => job.account,
      sortable: true,
    },
    {
      id: "partition",
      header: "Partition",
      cell: (job) => job.partition,
      sortable: true,
    },
    {
      id: "state",
      header: "State",
      cell: (job) => (
        <Badge tone={toneOf(stateOf(job))} size="sm" dot>
          {stateOf(job)}
        </Badge>
      ),
      sortable: true,
    },
    {
      id: "where",
      header: "Nodes or reason",
      // The nodes of a job that has them, and otherwise why it waits or
      // ended as it did.
      cell: (job) =>
        job.nodes !== undefined && job.state !== "PENDING" ? (
          <span className="font-mono text-xs">{job.nodes}</span>
        ) : (
          <span className="text-t2">{job.reason ?? ""}</span>
        ),
    },
    {
      id: "cpus",
      header: "CPUs",
      cell: (job) => (job.cpus === undefined ? "" : String(job.cpus)),
      align: "end",
      mono: true,
      sortable: true,
      firstOrder: "desc",
    },
    {
      id: "time",
      header: "Time and limit",
      cell: (job) => `${duration(elapsed(job, at))} / ${limit(job)}`,
      mono: true,
    },
    {
      id: "priority",
      header: "Priority",
      cell: (job) => (job.priority === undefined ? "" : String(job.priority)),
      align: "end",
      mono: true,
      sortable: true,
      firstOrder: "desc",
    },
  ];
}
