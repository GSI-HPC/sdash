// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { cx } from "./classes";

/** One line of a key and value list. */
export interface KVItem {
  /** What the value is; unique within the list, and its key in React. */
  term: string;
  /** The value, or what stands in its place: a badge, a link. */
  value: ReactNode;
  /**
   * Set in DM Mono, for an id, a path, a figure; true unless said
   * otherwise. A value in words is set in DM Sans.
   */
  mono?: boolean;
}

/** The props of a key and value list. */
export interface KVListProps {
  items: readonly KVItem[];
  /** Classes for the layout around the list, never for its look. */
  className?: string;
}

/**
 * Terms and their values, a pair to a line: the details of one thing, on
 * a card or in a drawer. It is a description list, which assistive
 * technology reads as terms with their values, and each pair is a line
 * with the term at its start and the value at its end.
 *
 * A value that does not fit beside its term breaks, also inside a word:
 * an id or a path has no spaces to break at, and a list in a narrow
 * drawer must not be wider than the drawer.
 *
 * The term is in --t3 as the handoff has it, which stands 4.7:1 on a card
 * and on a drawer in the light theme and not 4.5:1 on the page or on the
 * elevated background: a card or a drawer is its ground.
 */
export function KVList({ items, className }: KVListProps) {
  return (
    <dl className={cx("flex flex-col", className)}>
      {items.map(({ term, value, mono = true }) => (
        <div
          key={term}
          className="flex items-baseline justify-between gap-4 border-b border-bds py-1.25 last:border-b-0"
        >
          <dt className="shrink-0 text-[0.78125rem] text-t3">{term}</dt>
          <dd
            className={cx(
              "min-w-0 text-right text-t1 wrap-anywhere",
              mono ? "font-mono text-xs" : "text-[0.78125rem]",
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
