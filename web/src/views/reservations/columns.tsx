// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Badge } from "../../primitives/Badge";
import type { TableColumn } from "../../primitives/Table";
import {
  accessOf,
  lengthOf,
  phaseOf,
  phases,
  type Reservation,
  timeOf,
} from "./reservations";

/** A number of things, with the word in the singular or the plural. */
function count(n: number, one: string, more: string): string {
  return `${String(n)} ${n === 1 ? one : more}`;
}

/**
 * The columns of the table of reservations, after the handoff's: the name
 * and the nodes, where it stands at `now`, its times, what it holds, who
 * may use it, and its flags.
 */
export function reservationColumns(
  now: Date,
): readonly TableColumn<Reservation>[] {
  return [
    {
      id: "name",
      header: "Reservation",
      cell: (reservation) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{reservation.name}</span>
          <span className="font-mono text-[0.6875rem] text-t3">
            {reservation.nodes}
          </span>
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: (reservation) => {
        const { word, tone } = phases[phaseOf(reservation, now)];
        return (
          <Badge tone={tone} size="sm" dot>
            {word}
          </Badge>
        );
      },
    },
    {
      id: "start",
      header: "Start",
      cell: (reservation) => timeOf(reservation.startTime, "Not set"),
    },
    {
      id: "end",
      header: "End",
      cell: (reservation) => timeOf(reservation.endTime, "No end"),
    },
    {
      id: "duration",
      header: "Duration",
      cell: (reservation) => (
        <span className="font-mono">{lengthOf(reservation) ?? ""}</span>
      ),
    },
    {
      id: "holds",
      header: "Holds",
      cell: (reservation) => (
        <span className="flex flex-col gap-0.5">
          <span>
            {count(reservation.nodeCount, "node", "nodes")}
            {", "}
            {count(reservation.cores, "core", "cores")}
          </span>
          {reservation.partition !== undefined && (
            <span className="text-t2">{`in ${reservation.partition}`}</span>
          )}
        </span>
      ),
    },
    {
      id: "access",
      header: "Access",
      cell: (reservation) => (
        <span className="flex flex-col gap-0.5">
          {accessOf(reservation).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      ),
    },
    {
      id: "flags",
      header: "Flags",
      cell: (reservation) => (
        <span className="font-mono text-[0.6875rem]">
          {reservation.flags.join(", ")}
        </span>
      ),
    },
  ];
}
