// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { cx } from "./classes";
import { type GraphicTone, graphicTones } from "./graphics";

/** One entry of a legend. */
export interface LegendItem {
  /** What the colour stands for; unique among the items of its tone. */
  label: string;
  /** The colour, or "rest" for the track of a bar, what no part takes. */
  tone: GraphicTone | "rest";
  /** How many or how much, in words: "12", "3.5 TB". */
  value?: string;
}

/** The props of a legend. */
export interface LegendProps {
  items: readonly LegendItem[];
  /** Classes for the layout around the legend, never for its look. */
  className?: string;
}

/**
 * What the colours of a graphic stand for: a swatch, a label and a value
 * for each, in a list that goes on in the next line where it is narrow.
 * It is the text the graphic is read by, for whoever does not see the
 * colours or cannot tell them apart (WCAG 2.1, success criterion 1.4.1),
 * and assistive technology reads it as a list. The swatches are hidden
 * from it.
 *
 * Where the system forces its colours the swatches lose theirs and keep
 * their outline; the labels are then the legend.
 */
export function Legend({ items, className }: LegendProps) {
  return (
    <ul
      className={cx(
        "flex flex-wrap gap-x-3.5 gap-y-1 text-[0.71875rem]",
        className,
      )}
    >
      {items.map(({ label, tone, value }) => (
        <li key={`${tone}:${label}`} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cx(
              "size-2 shrink-0 rounded-[1px] forced-colors:border forced-colors:border-[color:CanvasText]",
              tone === "rest" ? "bg-elevated" : graphicTones[tone].background,
            )}
          />
          <span className="text-t2">{label}</span>
          {value !== undefined && (
            <span className="font-semibold text-t1">{value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
