// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The filters of the Nodes view, kept in the address so that a reload and
// a link show the same nodes (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).

import {
  defineSearchParam,
  type SearchChange,
  setTo,
  text,
  words,
} from "../../routing/searchParams";

/** Text the name of a node contains. */
export const textParam = defineSearchParam("q", text, "");

/** The states the nodes show; none for every state. */
export const statesParam = defineSearchParam("state", words, []);

/** The partition the nodes are in; empty for every partition. */
export const partitionParam = defineSearchParam("partition", text, "");

/** The changes that take every filter away. */
export const clearFilters: readonly SearchChange[] = [
  setTo(textParam, textParam.fallback),
  setTo(statesParam, statesParam.fallback),
  setTo(partitionParam, partitionParam.fallback),
];
