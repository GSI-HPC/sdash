// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { timeOf } from "./moments";

// Noon, so that the day is the same in every time zone the tests run in.
const now = new Date("2026-06-15T12:00:00Z");

test("a moment of this year is written without its year", () => {
  expect(timeOf("2026-06-18T12:00:00Z", "None", now)).toMatch(
    /^Thu 18 Jun, \d\d:\d\d$/,
  );
});

test("a moment of another year is written with its year", () => {
  expect(timeOf("2036-06-18T12:00:00Z", "None", now)).toMatch(
    /^Wed 18 Jun 2036, \d\d:\d\d$/,
  );
});

test("no moment is written as the word given for none", () => {
  expect(timeOf(undefined, "Not set", now)).toBe("Not set");
});
