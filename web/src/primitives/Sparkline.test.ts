// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { describeSeries, linePoints } from "./Sparkline";

/** The heights of the points of a line, as numbers. */
function heights(points: string): number[] {
  return points.split(" ").map((point) => Number(point.split(",")[1]));
}

test("the line runs across the whole width, its highest value at the top", () => {
  const points = linePoints([1, 3, 2]);

  expect(points).toBe("0,26 50,2 100,14");
});

test("a series of equal values is a level line through the middle", () => {
  expect(heights(linePoints([7, 7, 7]))).toEqual([14, 14, 14]);
});

test("one value is a level line across the whole width", () => {
  expect(linePoints([5])).toBe("0,14 100,14");
});

test("no values are no line", () => {
  expect(linePoints([])).toBe("");
});

test("the words say how many values, the first and the last, the lowest and the highest", () => {
  const words = describeSeries("Example", [3, 1, 4, 1, 5], String);

  expect(words).toBe("Example: 5 values, from 3 to 5, lowest 1, highest 5");
});

test("the words say so when there is one value or none", () => {
  expect(describeSeries("Example", [5], String)).toBe("Example: one value, 5");
  expect(describeSeries("Example", [], String)).toBe("Example: no values");
});
