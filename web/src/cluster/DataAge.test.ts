// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { ageOf } from "./DataAge";

const then = new Date("2026-01-01T12:00:00Z");
const later = (seconds: number) => new Date(then.getTime() + seconds * 1000);

test.each([
  [0, "just now"],
  [9, "just now"],
  [10, "10 s ago"],
  [59, "59 s ago"],
  [60, "1 minute ago"],
  [150, "2 minutes ago"],
  [3600, "1 hour ago"],
  [7300, "2 hours ago"],
  [-30, "just now"],
])("an age of %d seconds is %s", (seconds, words) => {
  expect(ageOf(then, later(seconds))).toBe(words);
});
