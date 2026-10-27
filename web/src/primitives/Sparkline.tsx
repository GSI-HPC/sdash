// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { cx } from "./classes";
import { type GraphicTone, graphicTones } from "./graphics";

/** The props of a sparkline. */
export interface SparklineProps {
  /** What the series is of: the start of what assistive technology is told. */
  label: string;
  /** The series, oldest first. A value that is no number is left out. */
  values: readonly number[];
  /** A value in words; in British English with separators unless said otherwise. */
  format?: (value: number) => string;
  /** The accent unless said otherwise. */
  tone?: GraphicTone;
  /** Classes for the layout around the sparkline, never for its look. */
  className?: string;
}

const british = new Intl.NumberFormat("en-GB");

function asNumber(value: number): string {
  return british.format(value);
}

// The drawing is 100 wide and 28 high and stretched to its box, the
// line's width kept by vector-effect. It keeps 2 above and below, so that
// the line at the highest and the lowest value is not cut in half.
const height = 28;
const inset = 2;

/** The points of the line, as the points attribute of a polyline. */
export function linePoints(values: readonly number[]): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return `0,${String(height / 2)} 100,${String(height / 2)}`;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const step = 100 / (values.length - 1);
  return values
    .map((value, index) => {
      const y =
        high === low
          ? height / 2
          : height -
            inset -
            ((value - low) / (high - low)) * (height - 2 * inset);
      return `${String(Number((index * step).toFixed(3)))},${String(Number(y.toFixed(3)))}`;
    })
    .join(" ");
}

/** What a sparkline says in words: how many values, where it starts and ends, its range. */
export function describeSeries(
  label: string,
  values: readonly number[],
  format: (value: number) => string,
): string {
  const [first] = values;
  const last = values.at(-1);
  if (first === undefined || last === undefined) {
    return `${label}: no values`;
  }
  if (values.length === 1) {
    return `${label}: one value, ${format(first)}`;
  }
  return `${label}: ${String(values.length)} values, from ${format(first)} to ${format(last)}, lowest ${format(Math.min(...values))}, highest ${format(Math.max(...values))}`;
}

/**
 * A small line of a series over time, with no axes: how a figure moved,
 * beside the figure itself. It is an image to assistive technology, whose
 * text says how many values there are, the first and the last, and the
 * lowest and the highest, which is what a reader takes from the line.
 *
 * The line is in the colour of its tone, which stands 3:1 on a card
 * (graphics.ts), and the area under it a tint of the same; where the
 * system forces its colours the line is in the colour of text and the area
 * goes.
 */
export function Sparkline({
  label,
  values,
  format = asNumber,
  tone = "accent",
  className,
}: SparklineProps) {
  const series = values.filter((value) => Number.isFinite(value));
  const points = linePoints(series);

  return (
    <svg
      role="img"
      aria-label={describeSeries(label, series, format)}
      viewBox={`0 0 100 ${String(height)}`}
      preserveAspectRatio="none"
      className={cx("block h-7 w-full", className)}
    >
      {points !== "" && (
        <>
          <polygon
            points={`0,${String(height)} ${points} 100,${String(height)}`}
            fillOpacity="0.12"
            className={cx(graphicTones[tone].fill, "forced-colors:fill-none")}
          />
          <polyline
            points={points}
            fill="none"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className={cx(
              graphicTones[tone].stroke,
              "forced-colors:stroke-[CanvasText]",
            )}
          />
        </>
      )}
    </svg>
  );
}
