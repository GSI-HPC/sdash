// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the command palette offers and how it arranges what a query finds.
// The entries are handed in by the shell: one for each view of the view
// table and one for each of its own actions. Jobs, nodes and users will be
// found here too, once there is a cluster to ask
// (doc/adr/0016-e2e-and-fixtures-on-sind.md).

import { rank, type Searchable } from "./score";

/** The kinds of entry. */
export type Kind = "view" | "action";

/** The heading each kind is listed under. */
export const kindHeadings: Record<Kind, string> = {
  view: "Views",
  action: "Actions",
};

/** One entry of the palette. */
export interface PaletteItem extends Searchable {
  /** Unique among the entries. */
  readonly id: string;
  readonly kind: Kind;
  /** The shortcut that does the same, shown beside the label. */
  readonly keys?: string;
  /** What choosing the entry does. */
  readonly run: () => void;
}

/** The entries of one kind that a query found. */
export interface PaletteGroup {
  readonly kind: Kind;
  readonly items: readonly PaletteItem[];
}

/**
 * The entries a query finds, grouped by kind, each group best first. The
 * group with the best match comes first, so that the first entry of the
 * list, the one Enter chooses unless the user moves, is the best match of
 * all. Without a query nothing is best, and the kinds come in the order
 * the entries were handed in.
 */
export function search(
  query: string,
  items: readonly PaletteItem[],
): PaletteGroup[] {
  const ranked = rank(query, items);
  const order = [...new Set(ranked.map((item) => item.kind))];
  return order.map((kind) => ({
    kind,
    items: ranked.filter((item) => item.kind === kind),
  }));
}
