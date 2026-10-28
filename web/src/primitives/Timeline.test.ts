// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { daysOf, place, startOfDay } from "./Timeline";

const start = new Date(2026, 0, 13);
const end = new Date(2026, 0, 21);
const hour = 3_600_000;

test("a day starts at its midnight in the browser's time zone", () => {
  expect(startOfDay(new Date(2026, 0, 14, 15, 30))).toEqual(
    new Date(2026, 0, 14),
  );
});

test("the days of a window are counted by the calendar, with the midnight after the last", () => {
  const days = daysOf(new Date(2026, 2, 28, 12), 3);

  expect(days).toEqual([
    new Date(2026, 2, 28),
    new Date(2026, 2, 29),
    new Date(2026, 2, 30),
    new Date(2026, 2, 31),
  ]);
});

test("a stretch inside the window lies where its times are, as shares of the window", () => {
  const placed = place(
    { start: new Date(2026, 0, 15), end: new Date(2026, 0, 17) },
    start,
    end,
  );

  expect(placed?.at).toBeCloseTo(2 / 8);
  expect(placed?.length).toBeCloseTo(2 / 8);
});

test("a stretch is cut to the window, and one without an end runs to its end", () => {
  const before = place(
    {
      start: new Date(start.getTime() - 24 * hour),
      end: new Date(2026, 0, 14),
    },
    start,
    end,
  );
  const endless = place({ start: new Date(2026, 0, 19) }, start, end);

  expect(before?.at).toBe(0);
  expect(before?.length).toBeCloseTo(1 / 8);
  expect(endless?.at).toBeCloseTo(6 / 8);
  expect(endless?.length).toBeCloseTo(2 / 8);
});

test("a stretch outside the window, or of no length, is not placed", () => {
  expect(
    place(
      { start: new Date(2026, 1, 1), end: new Date(2026, 1, 2) },
      start,
      end,
    ),
  ).toBeNull();
  expect(
    place(
      { start: new Date(2025, 11, 1), end: new Date(2025, 11, 2) },
      start,
      end,
    ),
  ).toBeNull();
  expect(
    place(
      { start: new Date(2026, 0, 15), end: new Date(2026, 0, 15) },
      start,
      end,
    ),
  ).toBeNull();
});
