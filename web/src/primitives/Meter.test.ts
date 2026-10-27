// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { passedMark } from "./Meter";

test("a value at or above a mark has passed it, where high is bad", () => {
  const marks = { warn: 75, err: 90 };

  expect(passedMark(74.9, marks)).toBeNull();
  expect(passedMark(75, marks)).toBe("warn");
  expect(passedMark(89, marks)).toBe("warn");
  expect(passedMark(90, marks)).toBe("err");
  expect(passedMark(200, marks)).toBe("err");
});

test("a value at or below a mark has passed it, where low is bad", () => {
  const marks = { warn: 25, err: 10, direction: "low" } as const;

  expect(passedMark(26, marks)).toBeNull();
  expect(passedMark(25, marks)).toBe("warn");
  expect(passedMark(10, marks)).toBe("err");
  expect(passedMark(-1, marks)).toBe("err");
});

test("a meter with one mark passes that one alone", () => {
  expect(passedMark(95, { err: 90 })).toBe("err");
  expect(passedMark(95, { warn: 90 })).toBe("warn");
  expect(passedMark(95, {})).toBeNull();
});

test("a mark that is no number is passed by no value", () => {
  expect(passedMark(95, { err: -Infinity })).toBeNull();
  expect(passedMark(95, { warn: Number.NaN, err: 90 })).toBe("err");
  expect(passedMark(5, { err: Infinity, direction: "low" })).toBeNull();
});
