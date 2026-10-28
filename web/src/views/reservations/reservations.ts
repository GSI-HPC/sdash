// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the Reservations view says of a reservation: whether it holds its
// nodes yet, the colour of its stretch on the timeline, its times and who
// may use it. Nothing here renders.

import type { ReservationList } from "../../client/client";
import type { BadgeTone } from "../../primitives/Badge";
import type { GraphicTone } from "../../primitives/graphics";
import { daysOf, place } from "../../primitives/Timeline";
import { duration } from "../jobs/format";

/** One reservation of a cluster. */
export type Reservation = ReservationList["rows"][number];

/** Where a reservation stands at a moment. */
export type Phase = "active" | "upcoming" | "ended";

/** The word and the tone of each phase. */
export const phases = {
  active: { word: "Active", tone: "ok" },
  upcoming: { word: "Upcoming", tone: "info" },
  ended: { word: "Ended", tone: "neutral" },
} as const satisfies Record<Phase, { word: string; tone: BadgeTone }>;

/**
 * Where a reservation stands at `now`: upcoming before its start, ended
 * after its end, and active between them. One without a start is taken to
 * hold its nodes already, as slurmctld sets a start on every reservation
 * it makes.
 */
export function phaseOf(reservation: Reservation, now: Date): Phase {
  const at = now.getTime();
  if (
    reservation.startTime !== undefined &&
    Date.parse(reservation.startTime) > at
  ) {
    return "upcoming";
  }
  if (
    reservation.endTime !== undefined &&
    Date.parse(reservation.endTime) <= at
  ) {
    return "ended";
  }
  return "active";
}

/**
 * The tone of a reservation on the timeline, as the handoff colours it:
 * one for maintenance, one for a reservation that repeats daily, and one
 * for the rest.
 */
export function toneOf(reservation: Reservation): GraphicTone {
  if (reservation.flags.includes("MAINT")) {
    return "warn";
  }
  if (reservation.flags.includes("DAILY")) {
    return "info";
  }
  return "vio";
}

/** The days the timeline shows: from yesterday, eight of them. */
export const shownDays = 8;

/** The first day the timeline shows: yesterday. */
export function firstDay(now: Date): Date {
  const day = new Date(now);
  day.setDate(now.getDate() - 1);
  return day;
}

/** Whether a reservation holds its nodes in some part of the days shown. */
export function inWindow(reservation: Reservation, now: Date): boolean {
  if (reservation.startTime === undefined) {
    return false;
  }
  const days = daysOf(firstDay(now), shownDays);
  const [start] = days;
  const end = days.at(-1);
  return (
    start !== undefined &&
    end !== undefined &&
    place(
      {
        start: new Date(reservation.startTime),
        ...(reservation.endTime === undefined
          ? {}
          : { end: new Date(reservation.endTime) }),
      },
      start,
      end,
    ) !== null
  );
}

const moment = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** A time of a reservation, as "Thu 15 Jan, 14:00"; `none` when it has none. */
export function timeOf(time: string | undefined, none: string): string {
  return time === undefined ? none : moment.format(new Date(time));
}

/** How long a reservation lasts, as Slurm's tools write it; none without both ends. */
export function lengthOf(reservation: Reservation): string | undefined {
  if (
    reservation.startTime === undefined ||
    reservation.endTime === undefined
  ) {
    return undefined;
  }
  return duration(
    (Date.parse(reservation.endTime) - Date.parse(reservation.startTime)) /
      1000,
  );
}

/**
 * Who may use a reservation, one line for each kind of name it lists. A
 * name that slurmctld writes with a "-" in front is denied the
 * reservation, and is written "not" and the name.
 */
export function accessOf(reservation: Reservation): string[] {
  const lists = [
    ["Users", reservation.users],
    ["Accounts", reservation.accounts],
    ["Groups", reservation.groups],
  ] as const;
  return lists
    .filter(([, names]) => names.length > 0)
    .map(
      ([kind, names]) =>
        `${kind}: ${names
          .map((name) => (name.startsWith("-") ? `not ${name.slice(1)}` : name))
          .join(", ")}`,
    );
}
