// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { count, micros, shareOfBusiest } from "./diagnostics";

test("writes a time in microseconds in the unit that fits it", () => {
  expect(micros(0)).toBe("0 µs");
  expect(micros(850)).toBe("850 µs");
  expect(micros(1_240)).toBe("1.2 ms");
  expect(micros(45_000)).toBe("45 ms");
  expect(micros(1_500_000)).toBe("1.5 s");
  expect(micros(125_000_000)).toBe("125 s");
});

test("writes a count with the separators of British English", () => {
  expect(count(1234567)).toBe("1,234,567");
});

test("takes the share of the busiest row, and 0 where no row had a call", () => {
  const busy = { name: "a", count: 200, mean: 0, total: 0 };
  const quiet = { name: "b", count: 50, mean: 0, total: 0 };
  expect(shareOfBusiest(busy, [busy, quiet])).toBe(1);
  expect(shareOfBusiest(quiet, [busy, quiet])).toBe(0.25);
  const idle = { name: "c", count: 0, mean: 0, total: 0 };
  expect(shareOfBusiest(idle, [idle])).toBe(0);
});
