// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { cx } from "./classes";

// The tones of a badge: its tint, the colour of its text, and the colour
// of its dot.
//
// The handoff sets the text of a toned badge in the tone's own colour
// (--ok-fg on --ok-bg, say), which is below 4.5:1 for two tones in the
// light theme and for all of them once the badge lies on a row under the
// pointer, since the tints are translucent. The text is --t1 here, which
// stands at least 9:1 on every tint over every background, and the tone
// is carried by the tint and the dot. The dot takes the colour the handoff
// gave the text, because its own, the solid tone, is below the 3:1 of a
// state indicator in the light theme (doc/ui.md lists the departures).
const tones = {
  neutral: { badge: "bg-elevated text-t2", dot: "bg-(--t3)" },
  ok: { badge: "bg-ok-bg text-t1", dot: "bg-ok-fg" },
  warn: { badge: "bg-warn-bg text-t1", dot: "bg-warn-fg" },
  err: { badge: "bg-err-bg text-t1", dot: "bg-err-fg" },
  info: { badge: "bg-info-bg text-t1", dot: "bg-info-fg" },
  vio: { badge: "bg-vio-bg text-t1", dot: "bg-vio-fg" },
  org: { badge: "bg-org-bg text-t1", dot: "bg-org-fg" },
  accent: { badge: "bg-ac-m text-t1", dot: "bg-ac-t" },
} as const;

/** The tones of a badge, after the status colours of the handoff. */
export type BadgeTone = keyof typeof tones;

// The shape of each size, and beside it the weight of its text, which is
// kept apart because a badge in the monospaced font has a weight of its
// own.
//
// A badge is as high as its text makes it, and stands in the dense rows of
// a table, so its line is as high as the handoff's and not as the page's,
// which is half as high again as the text. The transparent border takes
// 1 px of the handoff's padding above and below: 19 and 16 px in all,
// where the handoff has 19 and 15.
const sizes = {
  sm: {
    shape: "rounded-[3px] px-1.5 text-[0.65625rem] leading-[1.3]",
    weight: "font-semibold",
  },
  md: {
    shape: "rounded-sm px-2 py-px text-[0.71875rem] leading-[1.3]",
    weight: "font-medium",
  },
} as const;

/** The sizes of a badge. */
export type BadgeSize = keyof typeof sizes;

/** The shape of a pill, which stands in place of a size. */
const pill = {
  shape: "h-6 rounded-xl px-2 text-[0.71875rem]",
  weight: "font-semibold",
} as const;

// DM Mono comes in two weights, 400 and 500. Asked for a heavier one, the
// browser thickens the 500 itself, which smears letters this small.
const monoFace = "font-mono font-medium";

/** The props of a badge. */
export interface BadgeProps {
  /** The tint behind the text; "neutral" unless said otherwise. */
  tone?: BadgeTone;
  /** "sm" for a badge inside a dense row; "md" unless said otherwise. */
  size?: BadgeSize;
  /** A dot in the colour of the tone before the text. */
  dot?: boolean;
  /** In DM Mono, for an id or a path. */
  mono?: boolean;
  /** Fully rounded and 24 px high, whatever `size` says. */
  pill?: boolean;
  /** Classes for the layout around the badge, never for its look. */
  className?: string;
  /** The text, which says what the tone only repeats. */
  children: ReactNode;
}

/**
 * A short label on a tint: a state, a kind, a count. It cannot be pressed.
 * A label that filters when pressed is a Chip.
 *
 * The text carries the meaning. The tint and the dot repeat it in colour
 * for whoever sees colour (WCAG 2.1, success criterion 1.4.1), and the dot
 * is hidden from assistive technology. Which tone a state has is for the
 * caller to say: nothing here knows what a word means.
 *
 * The border is transparent. A contrast theme of the system removes the
 * tint and paints the border, so the badge keeps a boundary there.
 */
export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  mono = false,
  pill: asPill = false,
  className,
  children,
}: BadgeProps) {
  const { shape, weight } = asPill ? pill : sizes[size];

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.25 border border-transparent whitespace-nowrap",
        shape,
        mono ? monoFace : weight,
        tones[tone].badge,
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cx("size-1.5 shrink-0 rounded-full", tones[tone].dot)}
        />
      )}
      {children}
    </span>
  );
}
