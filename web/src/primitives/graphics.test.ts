// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { percent, shareOf } from "./graphics";

test("a value lies between the ends of its range as a share from 0 to 1", () => {
  expect(shareOf(25, 0, 100)).toBe(0.25);
  expect(shareOf(15, 10, 30)).toBe(0.25);
  expect(shareOf(0, -50, 50)).toBe(0.5);
});

// A bar never runs out of its track, and a meter told a value outside its
// range draws it at the nearer end and says it as it is.
test("a value outside its range lies at the nearer end", () => {
  expect(shareOf(120, 0, 100)).toBe(1);
  expect(shareOf(-5, 0, 100)).toBe(0);
});

test("a value that is no number, or a range of no width, lies at the start", () => {
  expect(shareOf(Number.NaN, 0, 100)).toBe(0);
  expect(shareOf(Number.POSITIVE_INFINITY, 0, 100)).toBe(0);
  expect(shareOf(5, 10, 10)).toBe(0);
  expect(shareOf(5, 10, 0)).toBe(0);
});

test("a share is written as a percentage of at most three places", () => {
  expect(percent(0.375)).toBe("37.5%");
  expect(percent(1 / 3)).toBe("33.333%");
  expect(percent(0)).toBe("0%");
  expect(percent(1)).toBe("100%");
});
