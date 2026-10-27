// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { cx } from "./classes";

// The widths of the bars, in turn, so that the lines look like lines of
// text and not like a table. They are no data, so they are classes.
const widths = ["w-full", "w-11/12", "w-3/4", "w-5/6", "w-2/3"] as const;

/** The props of a skeleton. */
export interface SkeletonProps {
  /** What is on its way, in words: "Loading", "Loading the figures". */
  label?: string;
  /** How many lines the content will have, about; 3 unless said otherwise. */
  lines?: number;
  /** Classes for the layout around the skeleton, never for its look. */
  className?: string;
}

/**
 * The place of content that is on its way: a few grey lines where the
 * text will be, and a word that says so. It stands in the card the content
 * will stand in, so that the card has its size before the content comes.
 *
 * It is still. A shimmer says nothing a word does not, moves for as long
 * as the wait lasts, and would have to stop for whoever asks for less
 * motion; the handoff has no skeleton to follow. The word is on the page,
 * for everyone, and is the status assistive technology is told of: the
 * lines are hidden from it. The lines stand 1.1:1 against the card, which
 * is decoration: the word carries the meaning.
 */
export function Skeleton({
  label = "Loading",
  lines = 3,
  className,
}: SkeletonProps) {
  const count = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 1;

  return (
    <div role="status" className={cx("flex flex-col gap-2.5", className)}>
      <span className="text-[0.71875rem] text-t2">{`${label}…`}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: count }, (_, line) => (
          <span
            key={line}
            className={cx(
              "block h-2.5 rounded-sm bg-elevated forced-colors:border forced-colors:border-[color:CanvasText]",
              widths[line % widths.length],
            )}
          />
        ))}
      </div>
    </div>
  );
}
