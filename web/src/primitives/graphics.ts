// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the graphics share: the colours of their parts, and the arithmetic
// that turns a value into a length.
//
// A length that is data is never a style. The server's Content-Security-
// Policy forbids the style attribute, and a class cannot hold every width
// a value may have. So a bar is drawn in SVG, whose geometry is attributes:
// a rect with width="37.5%" inside an svg as wide as its box is as long as
// the value says, in every engine and at every zoom, without a script
// (doc/adr/0030-primitives-that-show-data.md).

/**
 * The tones a part of a graphic can have: a status colour of the handoff,
 * the accent, or none in particular.
 *
 * The handoff fills a part with the solid tone (--ok, --warn), which stands
 * 2.2:1 on a card in the light theme for --ok, below the 3:1 a part of a
 * graphic is read by (WCAG 2.1, success criterion 1.4.11). A part takes the
 * tone's text colour here (--ok-fg), which stands at least 4.2:1 on a card
 * and on the elevated background in both themes; the accent stays --ac, at
 * 3.5:1 against the track of a bar. A neutral part is --t3.
 */
export const graphicTones = {
  accent: { fill: "fill-ac", stroke: "stroke-ac", background: "bg-ac" },
  ok: { fill: "fill-ok-fg", stroke: "stroke-ok-fg", background: "bg-ok-fg" },
  warn: {
    fill: "fill-warn-fg",
    stroke: "stroke-warn-fg",
    background: "bg-warn-fg",
  },
  err: {
    fill: "fill-err-fg",
    stroke: "stroke-err-fg",
    background: "bg-err-fg",
  },
  info: {
    fill: "fill-info-fg",
    stroke: "stroke-info-fg",
    background: "bg-info-fg",
  },
  vio: {
    fill: "fill-vio-fg",
    stroke: "stroke-vio-fg",
    background: "bg-vio-fg",
  },
  org: {
    fill: "fill-org-fg",
    stroke: "stroke-org-fg",
    background: "bg-org-fg",
  },
  neutral: {
    fill: "fill-(--t3)",
    stroke: "stroke-(--t3)",
    background: "bg-(--t3)",
  },
} as const;

/** One of the tones of a part of a graphic. */
export type GraphicTone = keyof typeof graphicTones;

/**
 * Where a value lies between two others, as a share from 0 to 1. A value
 * outside lies at the nearer end; a range of no width, or a value that is
 * no number, at the start.
 */
export function shareOf(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !(max > min)) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * A share as the value of an SVG length: "37.5%". Three places are a
 * thousandth of a pixel on a bar a metre wide, and keep the attribute
 * short.
 */
export function percent(share: number): string {
  return `${String(Number((share * 100).toFixed(3)))}%`;
}
