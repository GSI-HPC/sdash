// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { client, type DataKind, JobSortKey } from "../client/client";
import { DataAge } from "../cluster/DataAge";
import { failureOf } from "../cluster/failure";
import { usePulse } from "../cluster/useCluster";
import { PageHeader } from "../layout/PageHeader";
import { type SearchChange, setTo } from "../routing/searchParams";
import { useSearchChanges, useSearchParam } from "../routing/useSearchParam";
import { viewOf } from "../routing/views";
import { Banner } from "../primitives/Banner";
import { Button } from "../primitives/Button";
import { Card } from "../primitives/Card";
import { Chip } from "../primitives/Chip";
import { EmptyState } from "../primitives/EmptyState";
import { ErrorPanel } from "../primitives/ErrorPanel";
import { Input } from "../primitives/Input";
import { Select } from "../primitives/Select";
import { Skeleton } from "../primitives/Skeleton";
import { Table } from "../primitives/Table";
import { jobColumns } from "./jobs/columns";
import { wordOf } from "./jobs/format";
import {
  clearFilters,
  orderParam,
  pageParam,
  pageSize,
  partitionParam,
  queryOf,
  sortParam,
  statesParam,
  textParam,
  userParam,
} from "./jobs/params";
import { WithCluster } from "./WithCluster";

/** The kinds of data the view watches. */
const kinds: readonly DataKind[] = ["jobs"];

/**
 * The base states the view always offers to filter by, in the handoff's
 * order. A state Slurm adds beyond these is offered while a job is in it.
 */
const offeredStates = [
  "RUNNING",
  "PENDING",
  "SUSPENDED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "TIMEOUT",
] as const;

/**
 * The Jobs view: the jobs slurmctld knows of on the cluster, as the user
 * of the token may see them, a page at a time
 * (doc/adr/0035-the-jobs-view-and-its-table.md).
 */
export function Jobs() {
  const { title, summary } = viewOf("jobs");

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <WithCluster>{(cluster) => <JobsOf cluster={cluster} />}</WithCluster>
    </div>
  );
}

/**
 * The jobs of one cluster: the filters, the table and its pages.
 *
 * The server filters, sorts and cuts the list. The view asks for the page
 * the address names, and asks again when the pulse says that sdash holds
 * newer jobs than the page was cut from; while it waits, it shows the page
 * it had.
 */
function JobsOf({ cluster }: { cluster: string }) {
  const [text] = useSearchParam(textParam);
  const [states] = useSearchParam(statesParam);
  const [partition] = useSearchParam(partitionParam);
  const [user] = useSearchParam(userParam);
  const [sort] = useSearchParam(sortParam);
  const [order] = useSearchParam(orderParam);
  const [page, setPage] = useSearchParam(pageParam);
  const changeSearch = useSearchChanges();

  const pulse = usePulse(cluster, kinds);
  const me = pulse.data?.connection.user;
  const query = queryOf({ text, states, partition, user, sort, order, page });
  const jobs = useQuery({
    queryKey: ["jobs", cluster, query],
    queryFn: ({ signal }) => client.getJobs(cluster, query, { signal }),
    placeholderData: keepPreviousData,
  });

  // The pulse reports a newer generation than the page was cut from: the
  // page is asked for again. A read that failed with nothing held counts
  // as the generation the pulse reported when it failed, so that it is
  // asked for again once the jobs change. Asked for again at once, a read
  // that fails while sdash holds jobs would be asked for in a loop.
  const known = pulse.data?.kinds[0]?.generation;
  const [failure, setFailure] = useState({ at: 0, generation: 0 });
  if (jobs.isError && jobs.errorUpdatedAt !== failure.at) {
    setFailure({ at: jobs.errorUpdatedAt, generation: known ?? 0 });
  }
  const held =
    jobs.data?.generation ?? (jobs.isError ? failure.generation : undefined);
  const { refetch } = jobs;
  useEffect(() => {
    if (known !== undefined && held !== undefined && known > held) {
      void refetch({ cancelRefetch: false });
    }
  }, [known, held, refetch]);

  // The user of the token is known once sdash has read the token, which it
  // does for the first fetch: a pulse that came before it names nobody,
  // and is asked for again when the jobs arrive rather than at its next
  // turn, so that "you" and "My jobs" come with them.
  const refetchPulse = pulse.refetch;
  const unnamed = pulse.data !== undefined && me === undefined;
  useEffect(() => {
    if (unnamed && held !== undefined) {
      void refetchPulse({ cancelRefetch: false });
    }
  }, [unnamed, held, refetchPulse]);

  /** Changes the filters, and puts the list back on its first page. */
  function filter(...changes: readonly SearchChange[]) {
    changeSearch([...changes, setTo(pageParam, 1)]);
  }

  const list = jobs.data;
  const failed = jobs.isError ? failureOf(jobs.error) : undefined;
  const stale = list?.error === undefined ? undefined : failureOf(list.error);
  const facets = list?.facets;
  const filtered =
    text !== "" || states.length > 0 || partition !== "" || user !== "";
  const countOf = (state: string) =>
    facets?.states.find((facet) => facet.value === state)?.count ?? 0;
  const chips = [
    ...offeredStates,
    ...(facets?.states.map((facet) => facet.value) ?? [])
      .concat(states)
      .filter(
        (state, index, all) =>
          !(offeredStates as readonly string[]).includes(state) &&
          all.indexOf(state) === index,
      )
      .sort(),
  ];
  const partitions = [
    ...new Set([
      ...(facets?.partitions.map((facet) => facet.value) ?? []),
      ...(partition === "" ? [] : [partition]),
    ]),
  ].sort();
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / pageSize));
  const first = (Math.max(1, page) - 1) * pageSize;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          label="Filter the jobs"
          labelHidden
          placeholder="Filter by id, name, user, account"
          leading="search"
          fill="surface"
          value={text}
          onValueChange={(value) => {
            filter(setTo(textParam, value));
          }}
          className="w-full max-w-80"
        />
        <div
          role="group"
          aria-label="States"
          className="flex flex-wrap items-center gap-1"
        >
          <Chip
            size="sm"
            pressed={states.length === 0}
            onPressedChange={() => {
              filter(setTo(statesParam, []));
            }}
          >
            All
          </Chip>
          {chips.map((state) => (
            <Chip
              key={state}
              size="sm"
              count={countOf(state)}
              pressed={states.includes(state)}
              onPressedChange={(pressed) => {
                filter(
                  setTo(
                    statesParam,
                    pressed
                      ? chips.filter(
                          (chip) => chip === state || states.includes(chip),
                        )
                      : states.filter((other) => other !== state),
                  ),
                );
              }}
            >
              {wordOf(state)}
            </Chip>
          ))}
        </div>
        <Select
          label="Partition"
          labelHidden
          size="sm"
          fill="surface"
          options={[
            { value: "", label: "All partitions" },
            ...partitions.map((name) => ({ value: name, label: name })),
          ]}
          value={partition}
          onValueChange={(value) => {
            filter(setTo(partitionParam, value));
          }}
        />
        {me !== undefined && (
          <Chip
            size="sm"
            pressed={user === me}
            onPressedChange={(pressed) => {
              filter(setTo(userParam, pressed ? me : ""));
            }}
          >
            My jobs
          </Chip>
        )}
        <p role="status" className="ml-auto text-xs text-t2">
          {list !== undefined && (
            <>
              {list.total === 1 ? "1 job" : `${String(list.total)} jobs`}
              {", "}
              <DataAge fetchedAt={list.fetchedAt} />
            </>
          )}
        </p>
      </div>
      {stale !== undefined && (
        <Banner
          tone="warn"
          title={stale.title}
          {...(stale.code === undefined ? {} : { code: stale.code })}
        >
          {`The jobs shown are those sdash fetched last, and may be out of date. ${stale.text}`}
        </Banner>
      )}
      <Card
        flush
        footer={
          list !== undefined && list.total > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {`Jobs ${String(Math.min(first + 1, list.total))} to ${String(Math.min(first + list.rows.length, list.total))} of ${String(list.total)}`}
              </span>
              <span className="ml-auto flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(Math.min(page, pages) - 1);
                  }}
                >
                  Previous page
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => {
                    setPage(Math.max(page, 1) + 1);
                  }}
                >
                  Next page
                </Button>
              </span>
            </div>
          ) : undefined
        }
      >
        {list === undefined ? (
          failed !== undefined ? (
            <ErrorPanel
              title={failed.title}
              level={2}
              {...(failed.code === undefined ? {} : { code: failed.code })}
              onRetry={() => {
                void refetch();
              }}
              className="px-4 py-3.5"
            >
              {failed.text}
            </ErrorPanel>
          ) : (
            <Skeleton
              label="Loading the jobs"
              lines={6}
              className="px-4 py-3.5"
            />
          )
        ) : list.rows.length === 0 ? (
          <EmptyState
            title={
              list.total > 0
                ? "No jobs on this page"
                : filtered
                  ? "No jobs match these filters"
                  : "No jobs"
            }
            level={2}
            action={
              list.total > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPage(1);
                  }}
                >
                  Go to the first page
                </Button>
              ) : filtered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    filter(...clearFilters);
                  }}
                >
                  Clear the filters
                </Button>
              ) : undefined
            }
            className="px-4 py-8"
          >
            {list.total > 0
              ? `The list has ${String(pages)} pages.`
              : filtered
                ? "No job of the cluster passes all of these filters."
                : `slurmctld knows of no job on ${cluster} that the user of the token may see.`}
          </EmptyState>
        ) : (
          <Table
            label={`Jobs of ${cluster}`}
            columns={jobColumns(me, new Date(list.fetchedAt))}
            rows={list.rows}
            rowKey={(job) => String(job.id)}
            sort={{ column: sort, order }}
            onSortChange={(next) => {
              const key = Object.values<string>(JobSortKey).includes(
                next.column,
              )
                ? (next.column as JobSortKey)
                : JobSortKey.ID;
              changeSearch([
                setTo(sortParam, key),
                setTo(orderParam, next.order),
                setTo(pageParam, 1),
              ]);
            }}
          />
        )}
      </Card>
    </>
  );
}
