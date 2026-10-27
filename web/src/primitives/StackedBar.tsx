// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useId } from "react";

import { cx } from "./classes";
import { type GraphicTone, graphicTones, percent } from "./graphics";
import { Legend, type LegendItem } from "./Legend";

/** One part of a stacked bar. */
export interface BarPart {
  /** What the part is; unique within the bar. */
  label: string;
  /** How much; a value that is negative or no number counts as none. */
  value: number;
  tone: GraphicTone;
}

/** The props of a stacked bar. */
export interface StackedBarProps {
  /** What the bar shows, and the name of its group. */
  label: string;
  parts: readonly BarPart[];
  /**
   * The whole the parts are of. What the parts leave of it is drawn as the
   * empty track and listed as `restLabel`. The sum of the parts unless
   * said otherwise, and never less than it.
   */
  total?: number;
  /** The name of what the parts leave of the whole; "Rest" unless said otherwise. */
  restLabel?: string;
  /** A value in words; in British English with separators unless said otherwise. */
  format?: (value: number) => string;
  /** The height of the bar; "lg", 8 px, unless said otherwise. */
  size?: "sm" | "md" | "lg";
  /** Classes for the layout around the bar, never for its look. */
  className?: string;
}

const heights = { sm: "h-1", md: "h-1.5", lg: "h-2" } as const;

const british = new Intl.NumberFormat("en-GB");

function asNumber(value: number): string {
  return british.format(value);
}

/** The parts of a bar as drawn: where each starts and how long it is. */
export function layOut(
  parts: readonly BarPart[],
  total?: number,
): {
  segments: { part: BarPart; start: number; share: number }[];
  whole: number;
  rest: number;
} {
  const values = parts.map(({ value }) =>
    Number.isFinite(value) && value > 0 ? value : 0,
  );
  const sum = values.reduce((a, b) => a + b, 0);
  const whole =
    total !== undefined && Number.isFinite(total) ? Math.max(total, sum) : sum;
  let start = 0;
  const segments = parts.map((part, index) => {
    const share = whole > 0 ? (values[index] ?? 0) / whole : 0;
    const segment = { part, start, share };
    start += share;
    return segment;
  });
  return { segments, whole, rest: whole - sum };
}

/**
 * The parts of a whole side by side in one bar, with a legend that names
 * each part and says how much it is: how the things of a kind divide among
 * their states, say.
 *
 * The legend is the text of the bar. The bar and the legend are one group
 * named by `label`, the bar itself is hidden from assistive technology,
 * and the legend is read as a list: a bar without its legend would say by
 * colour alone which part is which (WCAG 2.1, success criterion 1.4.1).
 *
 * Neighbouring parts are kept apart by a gap of 1 px in the colour of the
 * track, as the handoff draws them, so that two of them never have to
 * differ from each other by colour alone: every part stands 3:1 against
 * the track (graphics.ts).
 * Where the system forces its colours, every part is drawn in the colour
 * of its text and the gaps tell them apart.
 */
export function StackedBar({
  label,
  parts,
  total,
  restLabel = "Rest",
  format = asNumber,
  size = "lg",
  className,
}: StackedBarProps) {
  const clipId = useId();
  const { segments, rest } = layOut(parts, total);
  const drawn = segments.filter(({ share }) => share > 0);
  // A gap between two parts. The rest after the last part is the track,
  // which the gap would not stand apart from.
  const gaps = drawn.slice(0, -1).map(({ start, share }) => start + share);
  const items: LegendItem[] = [
    ...parts.map(({ label: partLabel, value, tone }) => ({
      label: partLabel,
      tone,
      value: format(Number.isFinite(value) && value > 0 ? value : 0),
    })),
    ...(rest > 0
      ? [{ label: restLabel, tone: "rest", value: format(rest) } as const]
      : []),
  ];

  return (
    <div
      role="group"
      aria-label={label}
      className={cx("flex flex-col gap-2", className)}
    >
      <svg aria-hidden="true" className={cx("block w-full", heights[size])}>
        {/* The ends of the bar are rounded, whichever part lies there. */}
        <clipPath id={clipId}>
          <rect width="100%" height="100%" rx="2" />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <rect
            width="100%"
            height="100%"
            className="fill-(--bg-elevated) forced-colors:fill-[Canvas]"
          />
          {drawn.map(({ part, start, share }) => (
            <rect
              key={part.label}
              x={percent(start)}
              width={percent(share)}
              height="100%"
              className={cx(
                graphicTones[part.tone].fill,
                "forced-colors:fill-[CanvasText]",
              )}
            />
          ))}
          {gaps.map((end) => (
            <rect
              key={end}
              x={percent(end)}
              width="1"
              height="100%"
              className="fill-(--bg-elevated) forced-colors:fill-[Canvas]"
            />
          ))}
        </g>
        {/* The outline of the whole, where the system forces its colours. */}
        <rect
          width="100%"
          height="100%"
          rx="2"
          className="fill-none forced-colors:stroke-[CanvasText]"
        />
      </svg>
      <Legend items={items} />
    </div>
  );
}
