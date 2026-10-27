// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useId } from "react";

import { cx } from "./classes";
import { type GraphicTone, graphicTones, percent, shareOf } from "./graphics";

/**
 * The marks on a meter where its value turns from fine to a warning and
 * from a warning to an error. `direction` says which side of a mark is
 * the bad one: "high" for how much of something is used, "low" for how
 * much is left.
 */
export interface MeterThresholds {
  warn?: number;
  err?: number;
  /** "high" unless said otherwise. */
  direction?: "high" | "low";
}

// The height of the bar of each size, and of the drawing around it: marks
// stand out 2 px above and below the bar, so a meter with marks is 4 px
// higher.
const sizes = {
  sm: { bar: 4, plain: "h-1", marked: "h-2" },
  md: { bar: 6, plain: "h-1.5", marked: "h-2.5" },
  lg: { bar: 8, plain: "h-2", marked: "h-3" },
} as const;

/** The heights of the bar of a meter: 4, 6 and 8 px. */
export type MeterSize = keyof typeof sizes;

/**
 * Where the label and the value stand: above the bar, at either end of it,
 * or nowhere, where something next to the meter says both, as the figure
 * of a stat card does.
 */
export type MeterLayout = "stacked" | "inline" | "bare";

/** The props of a meter. */
export interface MeterProps {
  /** What is measured, and the name of the meter. */
  label: string;
  value: number;
  /** 0 unless said otherwise. */
  min?: number;
  /** 100 unless said otherwise. */
  max?: number;
  /**
   * The value in words, from the value and its share of the range. The
   * share as a whole percentage unless said otherwise: "37%".
   */
  format?: (value: number, share: number) => string;
  thresholds?: MeterThresholds;
  /** The colour of the bar while no mark is passed; the accent unless said otherwise. */
  tone?: GraphicTone;
  /** "md" unless said otherwise. */
  size?: MeterSize;
  /** "stacked" unless said otherwise. */
  layout?: MeterLayout;
  /** Classes for the layout around the meter, never for its look. */
  className?: string;
}

function asPercentage(_value: number, share: number): string {
  return `${String(Math.round(share * 100))}%`;
}

/** Which mark a value has passed, if any. */
export function passedMark(
  value: number,
  { warn, err, direction = "high" }: MeterThresholds,
): "warn" | "err" | null {
  // A mark that is no number is not drawn, so it is not passed either: the
  // colour would say what no mark shows.
  const past = (mark: number | undefined) =>
    mark !== undefined &&
    Number.isFinite(mark) &&
    (direction === "high" ? value >= mark : value <= mark);
  if (past(err)) {
    return "err";
  }
  return past(warn) ? "warn" : null;
}

const markNames = { warn: "the warning mark", err: "the error mark" } as const;

/**
 * A bar that shows how much of a whole is used, or left: of a quota, of a
 * capacity. It is a meter to assistive technology, with its range, its
 * value, and its value in words, which is also on the page beside the bar
 * in every layout but the bare one.
 *
 * Marks for a warning and an error stand across the bar where the value
 * would turn bad. A value past a mark turns the bar to the colour of that
 * mark, and the position of the bar's end against the mark says the same
 * to whoever does not see the colour (WCAG 2.1, success criterion 1.4.1);
 * the value in words for assistive technology names the mark it passed.
 *
 * A value outside the range is drawn at the nearer end and told as it is,
 * in words; a value that is no number is told as "No value".
 */
export function Meter({
  label,
  value,
  min = 0,
  max = 100,
  format = asPercentage,
  thresholds,
  tone = "accent",
  size = "md",
  layout = "stacked",
  className,
}: MeterProps) {
  const labelId = useId();
  const known = Number.isFinite(value);
  const share = shareOf(value, min, max);
  const passed = known && thresholds ? passedMark(value, thresholds) : null;
  const text = known ? format(value, share) : "No value";
  const spoken =
    passed === null
      ? text
      : `${text}, past ${markNames[passed]} of ${format(
          thresholds?.[passed] ?? 0,
          shareOf(thresholds?.[passed] ?? 0, min, max),
        )}`;
  const marks = (["warn", "err"] as const).flatMap((name) => {
    const mark = thresholds?.[name];
    return mark !== undefined && Number.isFinite(mark) ? [{ name, mark }] : [];
  });
  const { bar, plain, marked } = sizes[size];
  const top = marks.length > 0 ? 2 : 0;

  const drawing = (
    <svg
      aria-hidden="true"
      className={cx(
        "block w-full min-w-0 overflow-visible",
        marks.length > 0 ? marked : plain,
        layout === "inline" && "flex-1",
      )}
    >
      <rect
        y={top}
        width="100%"
        height={bar}
        rx={Math.min(2, bar / 2)}
        className="fill-(--bg-elevated) forced-colors:fill-[Canvas] forced-colors:stroke-[CanvasText]"
      />
      <rect
        y={top}
        width={percent(share)}
        height={bar}
        rx={Math.min(2, bar / 2)}
        className={cx(
          graphicTones[passed ?? tone].fill,
          "forced-colors:fill-[CanvasText]",
        )}
      />
      {marks.map(({ name, mark }) => (
        <rect
          key={name}
          x={percent(shareOf(mark, min, max))}
          width="2"
          height="100%"
          transform="translate(-1 0)"
          className="fill-(--t2) forced-colors:fill-[CanvasText]"
        />
      ))}
    </svg>
  );

  const meter = {
    role: "meter",
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": known ? Math.min(max, Math.max(min, value)) : min,
    "aria-valuetext": spoken,
  } as const;

  if (layout === "bare") {
    return (
      <div {...meter} aria-label={label} className={cx("flex", className)}>
        {drawing}
      </div>
    );
  }
  if (layout === "inline") {
    return (
      <div
        {...meter}
        aria-labelledby={labelId}
        className={cx("flex items-center gap-2.5", className)}
      >
        <span
          id={labelId}
          className="w-12.5 shrink-0 text-[0.71875rem] text-t3"
        >
          {label}
        </span>
        {drawing}
        <span className="min-w-10 shrink-0 text-right font-mono text-[0.6875rem] text-t2">
          {text}
        </span>
      </div>
    );
  }
  return (
    <div
      {...meter}
      aria-labelledby={labelId}
      className={cx("flex flex-col gap-1.5", className)}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span id={labelId} className="text-t3">
          {label}
        </span>
        <span className="font-medium text-t1">{text}</span>
      </span>
      {drawing}
    </div>
  );
}
