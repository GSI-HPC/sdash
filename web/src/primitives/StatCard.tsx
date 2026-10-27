// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useId } from "react";

import { cx, panel } from "./classes";
import { Heading, type HeadingLevel } from "./Heading";

/** The props of a stat card. */
export interface StatCardProps {
  /** What the figure is a figure of; the heading of the card. */
  label: string;
  /** The level of the heading; 2 unless said otherwise. */
  level?: HeadingLevel;
  /** The figure, written out by the caller: "1,024", "37%". */
  value: ReactNode;
  /** A unit after the figure, set smaller: "GB". */
  unit?: string;
  /** A short text at the end of the heading's line: "of 2,048". */
  aside?: ReactNode;
  /** A line below the figure that says more about it. */
  detail?: ReactNode;
  /**
   * A graphic of the figure below everything else: a Meter, whose name is
   * the label of the card, or a Sparkline of the figure over time.
   */
  children?: ReactNode;
  /** Classes for the layout around the card, never for its look. */
  className?: string;
}

/**
 * One figure on a card of its own, with what it is a figure of above it.
 * A row of them opens a view and says at a glance how things stand.
 *
 * The label is the heading of the card and its name as a region, so that
 * the figure is found by what it is. The figure is set in DM Sans like
 * the handoff's. That font has no figures of one width (doc/ui.md says so
 * under "Showing data"), so a figure that changes moves the unit after it
 * a little: a card holds one figure, and nothing below it lines up with
 * it.
 *
 * The handoff sets the label, the aside and the detail in --t3, which
 * stands 4.7:1 on the card in the light theme: the card is its ground and
 * nothing else.
 */
export function StatCard({
  label,
  level = 2,
  value,
  unit,
  aside,
  detail,
  children,
  className,
}: StatCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cx(
        "flex min-w-0 flex-col gap-2.5 px-4 py-3.5",
        panel,
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Heading
          level={level}
          id={headingId}
          className="text-xs font-medium text-t3"
        >
          {label}
        </Heading>
        {aside !== undefined && (
          <span className="text-[0.71875rem] text-t3">{aside}</span>
        )}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-1 text-t1">
        <span className="text-[1.625rem] leading-none font-semibold tracking-[-0.02em]">
          {value}
        </span>
        {unit !== undefined && (
          <span className="text-[0.8125rem] font-medium text-t3">{unit}</span>
        )}
      </p>
      {detail !== undefined && (
        <p className="text-[0.71875rem] text-t3">{detail}</p>
      )}
      {children}
    </section>
  );
}
