// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { layOut } from "./StackedBar";

const part = (value: number) => ({
  label: String(value),
  value,
  tone: "ok" as const,
});

test("the parts lie one after the other, each as long as its share of the sum", () => {
  const { segments, whole, rest } = layOut([part(1), part(3)]);

  expect(segments.map(({ start, share }) => [start, share])).toEqual([
    [0, 0.25],
    [0.25, 0.75],
  ]);
  expect(whole).toBe(4);
  expect(rest).toBe(0);
});

test("a whole larger than the parts leaves a rest", () => {
  const { segments, rest } = layOut([part(20), part(30)], 100);

  expect(segments.map(({ share }) => share)).toEqual([0.2, 0.3]);
  expect(rest).toBe(50);
});

// The bar has to hold its parts: a whole given too small would draw them
// past its end.
test("a whole smaller than the parts is taken to be their sum", () => {
  const { segments, whole, rest } = layOut([part(20), part(30)], 10);

  expect(whole).toBe(50);
  expect(rest).toBe(0);
  expect(segments.at(-1)?.start).toBe(0.4);
});

test("a part that is negative or no number counts as none", () => {
  const { segments, whole } = layOut([part(-4), part(Number.NaN), part(2)]);

  expect(whole).toBe(2);
  expect(segments.map(({ share }) => share)).toEqual([0, 0, 1]);
});

test("parts of nothing have no length", () => {
  const { segments, whole } = layOut([part(0), part(0)]);

  expect(whole).toBe(0);
  expect(segments.map(({ share }) => share)).toEqual([0, 0]);
});
