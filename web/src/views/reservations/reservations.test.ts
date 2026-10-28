// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import {
  accessOf,
  inWindow,
  lengthOf,
  phaseOf,
  type Reservation,
  toneOf,
} from "./reservations";

const now = new Date("2026-01-14T12:00:00Z");

function reservation(more: Partial<Reservation> = {}): Reservation {
  return {
    name: "r",
    nodes: "n1",
    nodeCount: 1,
    cores: 2,
    flags: [],
    users: [],
    accounts: [],
    groups: [],
    ...more,
  };
}

test("a reservation is upcoming before its start, active until its end, and ended after it", () => {
  const times = {
    startTime: "2026-01-14T10:00:00Z",
    endTime: "2026-01-14T14:00:00Z",
  };
  expect(phaseOf(reservation(times), new Date("2026-01-14T09:00:00Z"))).toBe(
    "upcoming",
  );
  expect(phaseOf(reservation(times), now)).toBe("active");
  expect(phaseOf(reservation(times), new Date("2026-01-14T14:00:00Z"))).toBe(
    "ended",
  );
  expect(phaseOf(reservation({ startTime: times.startTime }), now)).toBe(
    "active",
  );
});

test("maintenance and a daily reservation have tones of their own", () => {
  expect(toneOf(reservation({ flags: ["SPEC_NODES", "MAINT"] }))).toBe("warn");
  expect(toneOf(reservation({ flags: ["DAILY"] }))).toBe("info");
  expect(toneOf(reservation({ flags: ["IGNORE_JOBS"] }))).toBe("vio");
});

test("a reservation is in the window when it holds its nodes from yesterday to six days from today", () => {
  expect(
    inWindow(
      reservation({
        startTime: "2026-01-10T00:00:00Z",
        endTime: "2026-01-13T18:00:00Z",
      }),
      now,
    ),
  ).toBe(true);
  expect(
    inWindow(reservation({ startTime: "2026-01-19T12:00:00Z" }), now),
  ).toBe(true);
  expect(
    inWindow(reservation({ startTime: "2026-02-01T00:00:00Z" }), now),
  ).toBe(false);
  expect(
    inWindow(
      reservation({
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-02T00:00:00Z",
      }),
      now,
    ),
  ).toBe(false);
  expect(inWindow(reservation(), now)).toBe(false);
});

test("the length of a reservation is written as Slurm's tools write it, and only with both ends", () => {
  expect(
    lengthOf(
      reservation({
        startTime: "2026-01-14T10:00:00Z",
        endTime: "2026-01-15T11:30:00Z",
      }),
    ),
  ).toBe("1-01:30:00");
  expect(
    lengthOf(reservation({ startTime: "2026-01-14T10:00:00Z" })),
  ).toBeUndefined();
});

test("who may use a reservation is listed by kind, with a denied name said in words", () => {
  expect(
    accessOf(reservation({ users: ["alice", "-bob"], groups: ["hpc"] })),
  ).toEqual(["Users: alice, not bob", "Groups: hpc"]);
  expect(accessOf(reservation())).toEqual([]);
});
