// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The state of the Jobs view that lives in the address: its filters, its
// sort and its page (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
// A filter is sent to the server as it stands, and the server sorts and
// cuts the list (doc/adr/0034-cluster-data-in-the-browser-api.md).

import { type JobQuery, JobSortKey } from "../../client/client";
import {
  defineSearchParam,
  integer,
  oneOf,
  type SearchChange,
  setTo,
  text,
  words,
} from "../../routing/searchParams";

/** How many jobs a page shows. */
export const pageSize = 50;

/** Text the id, the name, the user or the account of a job contains. */
export const textParam = defineSearchParam("q", text, "");

/** The base states a job is in; none for every state. */
export const statesParam = defineSearchParam("state", words, []);

/** The partition of the jobs; empty for every partition. */
export const partitionParam = defineSearchParam("partition", text, "");

/** The user of the jobs; empty for every user. */
export const userParam = defineSearchParam("user", text, "");

/** The key the jobs are sorted by: the newest first, unless said otherwise. */
export const sortParam = defineSearchParam(
  "sort",
  oneOf(Object.values(JobSortKey)),
  JobSortKey.ID,
);

/** The direction of the sort. */
export const orderParam = defineSearchParam(
  "order",
  oneOf(["asc", "desc"] as const),
  "desc",
);

/** The page, from 1. */
export const pageParam = defineSearchParam("page", integer, 1);

/** The changes that take every filter away. */
export const clearFilters: readonly SearchChange[] = [
  setTo(textParam, textParam.fallback),
  setTo(statesParam, statesParam.fallback),
  setTo(partitionParam, partitionParam.fallback),
  setTo(userParam, userParam.fallback),
];

/** What the view asks the server for. */
export interface JobsShown {
  readonly text: string;
  readonly states: readonly string[];
  readonly partition: string;
  readonly user: string;
  readonly sort: JobSortKey;
  readonly order: "asc" | "desc";
  readonly page: number;
}

/**
 * The query of the operation for what the view shows: a filter that is
 * empty is left out, and a page below the first is the first.
 */
export function queryOf(shown: JobsShown): JobQuery {
  const page = Math.max(1, shown.page);
  return {
    ...(shown.text === "" ? {} : { q: shown.text }),
    ...(shown.states.length === 0 ? {} : { state: [...shown.states] }),
    ...(shown.partition === "" ? {} : { partition: shown.partition }),
    ...(shown.user === "" ? {} : { user: shown.user }),
    sort: shown.sort,
    order: shown.order,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };
}
