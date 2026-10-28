// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { cx } from "./classes";
import { type GraphicTone, graphicTones, percent } from "./graphics";

/** A stretch of time on a row of a timeline. */
export interface TimelineSegment {
  /** What the stretch is; unique within its row. */
  label: string;
  start: Date;
  /** Its end; none for a stretch that does not end. */
  end?: Date;
  tone: GraphicTone;
}

/** A row of a timeline: a name, a line below it, and its stretches. */
export interface TimelineRow {
  /** Unique within the timeline. */
  id: string;
  label: string;
  detail?: string;
  segments: readonly TimelineSegment[];
}

/** The props of a timeline. */
export interface TimelineProps {
  /**
   * What the timeline shows, in a sentence that also says where its rows
   * are listed in words: the timeline is an image to assistive technology.
   */
  label: string;
  /** The first day shown, from its midnight in the browser's time zone. */
  from: Date;
  /** How many days are shown. */
  days: number;
  /** The moment the line of now marks, and the day it marks as today. */
  now: Date;
  rows: readonly TimelineRow[];
  /** Classes for the layout around the timeline, never for its look. */
  className?: string;
}

/** The midnight that starts the day of `at`, in the browser's time zone. */
export function startOfDay(at: Date): Date {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** The midnights of `days` days from the one of `from`, and the one after the last. */
export function daysOf(from: Date, days: number): Date[] {
  const first = startOfDay(from);
  return Array.from({ length: Math.max(days, 0) + 1 }, (_, index) => {
    // By the calendar and not by 24 hours, which a day of a change of the
    // clocks is not.
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

/**
 * Where a stretch lies in the window from `start` to `end`, as shares of
 * the window: where it begins and how long it is, cut to the window. Null
 * for a stretch that lies outside it.
 */
export function place(
  segment: Pick<TimelineSegment, "start" | "end">,
  start: Date,
  end: Date,
): { at: number; length: number } | null {
  const window = end.getTime() - start.getTime();
  const from = Math.max(segment.start.getTime(), start.getTime());
  const to = Math.min(segment.end?.getTime() ?? Infinity, end.getTime());
  if (window <= 0 || to <= from) {
    return null;
  }
  return {
    at: (from - start.getTime()) / window,
    length: (to - from) / window,
  };
}

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

/**
 * Stretches of time on rows, over a few days with a line at now: when each
 * reservation of a cluster holds its nodes, say. Each row is named on the
 * left, and its stretches lie on a track in the tone given; the days are
 * named above.
 *
 * The timeline is an image to assistive technology, named by `label`: a
 * reader of the stretches would have to learn where each lies from its
 * place on the screen. What it shows has to be listed in words beside it,
 * as a table, and the label says where.
 *
 * A stretch takes the text colour of its tone, which stands 3:1 against
 * the track (graphics.ts); stretches of one row that touch are kept apart
 * by a gap in the colour of the track. The line of now is in the colour of
 * an error, as the handoff draws it, and today's name is in the accent.
 * Where the system forces its colours, the stretches are drawn in the
 * colour of its text.
 */
export function Timeline({
  label,
  from,
  days,
  now,
  rows,
  className,
}: TimelineProps) {
  const midnights = daysOf(from, days);
  const start = midnights[0] ?? startOfDay(from);
  const end = midnights.at(-1) ?? start;
  const today = startOfDay(now).getTime();
  const nowShare =
    now >= start && now < end
      ? (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())
      : null;
  // The line between two days, where the next one starts.
  const lines = midnights
    .slice(1, -1)
    .map(
      (day) =>
        (day.getTime() - start.getTime()) / (end.getTime() - start.getTime()),
    );

  return (
    <div
      role="img"
      aria-label={label}
      className={cx("flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="flex items-end gap-3">
        <div className="w-28 shrink-0 sm:w-40" />
        <div className="flex min-w-0 flex-1">
          {midnights.slice(0, -1).map((day) => (
            <span
              key={day.getTime()}
              className={cx(
                "min-w-0 flex-1 truncate border-l border-bd pl-1 text-[0.6875rem] tabular-nums",
                day.getTime() === today ? "font-semibold text-ac-t" : "text-t2",
              )}
            >
              <span className="max-sm:hidden">{weekday.format(day)} </span>
              {day.getDate()}
            </span>
          ))}
        </div>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3">
          <div className="flex w-28 shrink-0 flex-col sm:w-40">
            <span className="truncate text-[0.78125rem] font-medium">
              {row.label}
            </span>
            {row.detail !== undefined && (
              <span className="truncate font-mono text-[0.6875rem] text-t2">
                {row.detail}
              </span>
            )}
          </div>
          <svg aria-hidden="true" className="block h-5 min-w-0 flex-1">
            <rect
              width="100%"
              height="100%"
              rx="3"
              className="fill-(--bg-elevated) forced-colors:fill-[Canvas]"
            />
            {lines.map((share) => (
              <rect
                key={share}
                x={percent(share)}
                width="1"
                height="100%"
                className="fill-(--bd2) forced-colors:fill-[GrayText]"
              />
            ))}
            {row.segments.map((segment) => {
              const placed = place(segment, start, end);
              return placed === null ? null : (
                <rect
                  key={segment.label}
                  x={percent(placed.at)}
                  width={percent(placed.length)}
                  y="3"
                  height="14"
                  rx="2"
                  className={cx(
                    graphicTones[segment.tone].fill,
                    "stroke-(--bg-elevated) forced-colors:fill-[CanvasText] forced-colors:stroke-[Canvas]",
                  )}
                />
              );
            })}
            {nowShare !== null && (
              <rect
                x={percent(nowShare)}
                width="2"
                height="100%"
                className="fill-err-fg forced-colors:fill-[Highlight]"
              />
            )}
          </svg>
        </div>
      ))}
    </div>
  );
}
