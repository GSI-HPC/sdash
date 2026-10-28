// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { type JobsShown, pageSize, queryOf } from "./params";

const plain: JobsShown = {
  text: "",
  states: [],
  partition: "",
  user: "",
  sort: "id",
  order: "desc",
  page: 1,
};

test("a filter that is empty is left out of the query", () => {
  expect(queryOf(plain)).toEqual({
    sort: "id",
    order: "desc",
    offset: 0,
    limit: pageSize,
  });
});

test("every filter that is set goes to the server as it stands", () => {
  expect(
    queryOf({
      ...plain,
      text: "gpu",
      states: ["RUNNING", "PENDING"],
      partition: "main",
      user: "alice",
    }),
  ).toMatchObject({
    q: "gpu",
    state: ["RUNNING", "PENDING"],
    partition: "main",
    user: "alice",
  });
});

test("a page is a window of the sorted list, and a page below the first is the first", () => {
  expect(queryOf({ ...plain, page: 3 })).toMatchObject({
    offset: 2 * pageSize,
    limit: pageSize,
  });
  expect(queryOf({ ...plain, page: -2 })).toMatchObject({ offset: 0 });
});
