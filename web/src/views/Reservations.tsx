// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";

import { client } from "../client/client";
import { DataAge } from "../cluster/DataAge";
import { generationOf, usePulse } from "../cluster/useCluster";
import { useFollow } from "../cluster/useFollow";
import { PageHeader } from "../layout/PageHeader";
import { viewOf } from "../routing/views";
import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";
import { Table } from "../primitives/Table";
import { Timeline } from "../primitives/Timeline";
import { Stale, Unready } from "./Fetching";
import { reservationColumns } from "./reservations/columns";
import {
  firstDay,
  inWindow,
  phaseOf,
  phases,
  shownDays,
  toneOf,
} from "./reservations/reservations";
import { WithCluster } from "./WithCluster";

/**
 * The Reservations view: the reservations of the cluster on a timeline of
 * eight days from yesterday, and all of them in a table below it
 * (doc/adr/0037-the-reservations-view.md).
 */
export function Reservations() {
  const { title, summary } = viewOf("reservations");

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <WithCluster>
        {(cluster) => <ReservationsOf cluster={cluster} />}
      </WithCluster>
    </div>
  );
}

/**
 * The reservations of one cluster. Where each stands, and the line of now
 * on the timeline, are taken at the moment sdash fetched them: the view
 * shows the cluster as it was then, and stays the same until the next
 * fetch.
 */
function ReservationsOf({ cluster }: { cluster: string }) {
  const pulse = usePulse(cluster, viewOf("reservations").kinds);
  const reservations = useQuery({
    queryKey: ["reservations", cluster],
    queryFn: ({ signal }) => client.getReservations(cluster, { signal }),
  });
  useFollow(reservations, generationOf(pulse.data, "reservations"));

  const list = reservations.data;
  const now = list === undefined ? undefined : new Date(list.fetchedAt);
  const shown =
    list === undefined || now === undefined
      ? []
      : list.rows.filter((reservation) => inWindow(reservation, now));

  return (
    <>
      <p role="status" className="text-xs text-t2">
        {list !== undefined && (
          <>
            {list.rows.length === 1
              ? "1 reservation"
              : `${String(list.rows.length)} reservations`}
            {", "}
            <DataAge fetchedAt={list.fetchedAt} />
          </>
        )}
      </p>
      <Stale error={list?.error} what="The reservations shown" />
      {list === undefined || now === undefined ? (
        <Card flush>
          <Unready
            error={reservations.error}
            what="the reservations"
            level={2}
            onRetry={() => {
              void reservations.refetch();
            }}
            className="px-4 py-3.5"
          />
        </Card>
      ) : list.rows.length === 0 ? (
        <Card flush>
          <EmptyState title="No reservations" level={2} className="px-4 py-8">
            {`slurmctld holds no reservation on ${cluster}.`}
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card title="Timeline" level={2}>
            {shown.length === 0 ? (
              <p className="text-t2">
                No reservation holds its nodes from yesterday to six days from
                today.
              </p>
            ) : (
              <Timeline
                label={`The reservations of ${cluster} from yesterday to six days from today; the table below lists them in words`}
                from={firstDay(now)}
                days={shownDays}
                now={now}
                rows={shown.map((reservation) => ({
                  id: reservation.name,
                  label: reservation.name,
                  detail: `${phases[phaseOf(reservation, now)].word}, ${reservation.nodes}`,
                  segments: [
                    {
                      label: reservation.name,
                      start: new Date(reservation.startTime ?? list.fetchedAt),
                      ...(reservation.endTime === undefined
                        ? {}
                        : { end: new Date(reservation.endTime) }),
                      tone: toneOf(reservation),
                    },
                  ],
                }))}
              />
            )}
          </Card>
          <Card flush>
            <Table
              label={`Reservations of ${cluster}`}
              columns={reservationColumns(now)}
              rows={list.rows}
              rowKey={(reservation) => reservation.name}
            />
          </Card>
        </>
      )}
    </>
  );
}
