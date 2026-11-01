// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";

import { ApiError, ErrorCode, type Job } from "../../client/client";
import { client } from "../../client/client";
import { DataAge } from "../../cluster/DataAge";
import { generationOf, useAddressOf, usePulse } from "../../cluster/useCluster";
import { useFollow } from "../../cluster/useFollow";
import { viewOf } from "../../routing/views";
import { Badge } from "../../primitives/Badge";
import { Drawer, DrawerBody, DrawerHeader } from "../../primitives/Drawer";
import { EmptyState } from "../../primitives/EmptyState";
import { Heading } from "../../primitives/Heading";
import { type KVItem, KVList } from "../../primitives/KVList";
import { Stale, Unready } from "../Fetching";
import { timeOf } from "../moments";
import { duration, elapsed, limit, stateOf, toneOf } from "./format";

/** The props of the drawer of a job. */
export interface JobDrawerProps {
  cluster: string;
  /** The own id of the job shown; 0 while the drawer is closed. */
  id: number;
  onClose: () => void;
}

/**
 * The drawer of one job: where it stands, its times, what it was given
 * and where its files are (doc/adr/0039-the-job-and-node-drawers.md).
 *
 * The job is read by its own id, from the jobs sdash holds, so that a
 * job the page of the table does not show opens all the same; it is read
 * again when the pulse reports newer jobs. While the drawer slides out it
 * keeps showing the job it showed.
 */
export function JobDrawer({ cluster, id, onClose }: JobDrawerProps) {
  const [shown, setShown] = useState(id);
  if (id !== 0 && id !== shown) {
    setShown(id);
  }

  return (
    <Drawer open={id !== 0} onClose={onClose}>
      {shown !== 0 && <JobOf cluster={cluster} id={shown} />}
    </Drawer>
  );
}

/** The header and the body of the drawer of a job. */
function JobOf({ cluster, id }: { cluster: string; id: number }) {
  const pulse = usePulse(cluster, viewOf("jobs").kinds);
  const job = useQuery({
    queryKey: ["job", cluster, id],
    queryFn: ({ signal }) => client.getJob(cluster, id, { signal }),
  });
  useFollow(job, generationOf(pulse.data, "jobs"));

  const item = job.data;
  if (item === undefined) {
    const gone =
      job.error instanceof ApiError && job.error.code === ErrorCode.NOT_FOUND;
    return (
      <>
        <DrawerHeader eyebrow="Job" title={`Job ${String(id)}`} />
        <DrawerBody>
          {gone ? (
            <EmptyState title="No such job" level={3}>
              {`slurmctld holds no job ${String(id)} on ${cluster} that the user of the token may see. A job that ended a while ago is forgotten.`}
            </EmptyState>
          ) : (
            <Unready
              error={job.error}
              what="the job"
              level={3}
              onRetry={() => {
                void job.refetch();
              }}
            />
          )}
        </DrawerBody>
      </>
    );
  }

  const at = new Date(item.fetchedAt);
  const state = stateOf(item.job);
  return (
    <>
      <DrawerHeader
        eyebrow={`Job ${item.job.displayId}`}
        title={
          item.job.name === "" ? `Job ${item.job.displayId}` : item.job.name
        }
        meta={
          <>
            <Badge tone={toneOf(state)} dot>
              {state}
            </Badge>
            <span>
              {`User ${item.job.user}, partition ${item.job.partition}, `}
              <DataAge fetchedAt={item.fetchedAt} />
            </span>
          </>
        }
      />
      <DrawerBody className="flex flex-col gap-5">
        <Stale error={item.error} what="The job shown" />
        <JobDetails job={item.job} at={at} />
      </DrawerBody>
    </>
  );
}

/** A part of the details of a job: a heading and its list. */
function Part({
  title,
  items,
}: {
  title: string;
  items: readonly (KVItem | false)[];
}) {
  const shown = items.filter((item): item is KVItem => item !== false);
  if (shown.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1.5">
      <Heading level={3} className="text-xs font-semibold text-t2">
        {title}
      </Heading>
      <KVList items={shown} />
    </section>
  );
}

/** A line of a list for a value the job may lack, or nothing. */
function line(
  term: string,
  value: ReactNode | undefined,
  mono = true,
): KVItem | false {
  return value === undefined || value === "" ? false : { term, value, mono };
}

/** The details of a job, in parts; `at` is the moment its time counts to. */
function JobDetails({ job, at }: { job: Job; at: Date }) {
  const addressOf = useAddressOf();
  const exit = job.exitCode;

  return (
    <>
      <Part
        title="State"
        items={[
          line("Reason", job.reason, false),
          exit !== undefined &&
            line(
              "Exit code",
              [
                exit.status,
                exit.returnCode === undefined
                  ? undefined
                  : String(exit.returnCode),
                exit.signal,
              ]
                .filter((part) => part !== undefined && part !== "")
                .join(", "),
            ),
          line(
            "Priority",
            job.priority === undefined ? undefined : String(job.priority),
          ),
          line("Account", job.account),
          line("QOS", job.qos),
          line("Group", job.group),
          line("Reservation", job.reservation),
          line("Dependency", job.dependency),
          job.arrayJobId !== undefined && line("Array", String(job.arrayJobId)),
        ]}
      />
      <Part
        title="Times"
        items={[
          line("Submitted", timeOf(job.submitTime, "", at), false),
          line("Eligible", timeOf(job.eligibleTime, "", at), false),
          line("Started", timeOf(job.startTime, "", at), false),
          line(
            running(job) ? "Ends at the latest" : "Ended",
            job.state === "PENDING" ? undefined : timeOf(job.endTime, "", at),
            false,
          ),
          line("Run time", duration(elapsed(job, at))),
          line("Time limit", limit(job), job.timeLimit !== undefined),
        ]}
      />
      <Part
        title="Resources"
        items={[
          job.nodeNames.length > 0 && {
            term: "Nodes",
            value: (
              <span className="flex flex-wrap justify-end gap-x-2">
                {job.nodeNames.map((name) => (
                  <Link key={name} to={addressOf("/nodes", { node: name })}>
                    {name}
                  </Link>
                ))}
              </span>
            ),
          },
          job.nodeNames.length === 0 && line("Nodes", job.nodes),
          line(
            "Node count",
            job.nodeCount === undefined ? undefined : String(job.nodeCount),
          ),
          line("CPUs", job.cpus === undefined ? undefined : String(job.cpus)),
          line(
            "Tasks",
            job.tasks === undefined ? undefined : String(job.tasks),
          ),
          line("Trackable resources", job.tres),
          line("Batch host", job.batchHost),
        ]}
      />
      <Part
        title="Files"
        items={[
          line("Working directory", job.workDir),
          line("Standard output", job.stdout),
          line("Standard error", job.stderr),
          line("Submit line", job.submitLine),
          line("Comment", job.comment, false),
        ]}
      />
    </>
  );
}

/** Whether a job runs, so that its end is the one it expects. */
function running(job: Job): boolean {
  return job.state === "RUNNING" || job.state === "SUSPENDED";
}
