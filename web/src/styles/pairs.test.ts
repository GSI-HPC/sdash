// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import {
  brightened,
  type Colour,
  colourOf,
  contrast,
  over,
  type Theme,
  themes,
} from "../testing/contrast";

// The pairs of tokens the primitives set against each other, each with the
// least contrast it has to keep in both themes: 4.5:1 for text, and 3:1 for
// what a control or a state is known by, an icon, a boundary, a dot, a
// tick, the ring of the focus (WCAG 2.1, success criteria 1.4.3 and
// 1.4.11). The values of the tokens are the handoff's and may change with
// it; a change that takes one of these pairs below its least fails here,
// and names the pair (doc/adr/0026-ui-primitives-on-base-ui.md).
//
// The list is written by hand from the classes of web/src/primitives, and
// doc/ui.md states the same pairs with their ratios. A primitive that sets
// a new pair adds it here. What the browser makes of the classes is seen
// by the component tests and by the scan of the gallery.

const surface = "--bg-surface";
const page = "--bg-base";
const elevated = "--bg-elevated";
const hover = "--bg-hover";
const active = "--bg-active";

/** The grounds a control can lie on: a card, the page, a row under the pointer. */
const grounds = [surface, page, hover] as const;

/** The tints of the tones, each with the colour of its dot. */
const tones = [
  { tint: "--ok-bg", dot: "--ok-fg" },
  { tint: "--warn-bg", dot: "--warn-fg" },
  { tint: "--err-bg", dot: "--err-fg" },
  { tint: "--info-bg", dot: "--info-fg" },
  { tint: "--vio-bg", dot: "--vio-fg" },
  { tint: "--org-bg", dot: "--org-fg" },
  { tint: "--ac-m", dot: "--ac-t" },
] as const;

/** One pair: a colour, and what it stands against. */
interface Pair {
  /** What the colour is the colour of. */
  readonly what: string;
  /** The token of the colour. */
  readonly fore: string;
  /**
   * The tokens it stands against, the topmost first and an opaque one
   * last: a tint lies over what is under it.
   */
  readonly ground: readonly string[];
  /** A filter brightness() on the whole control, where it has one. */
  readonly brightness?: number;
}

/** The colour a stack of tokens shows, the topmost first. */
function shown(stack: readonly string[], theme: Theme): Colour {
  return stack
    .map((token) => colourOf(token, theme))
    .reduceRight((ground, top) => over(top, ground));
}

/** The contrast of a pair in a theme. */
function ratio({ fore, ground, brightness = 1 }: Pair, theme: Theme): number {
  return contrast(
    brightened(colourOf(fore, theme), brightness),
    brightened(shown(ground, theme), brightness),
  );
}

/** A line for each ground: the same colour against several. */
function onEach(
  what: string,
  fore: string,
  ...stacks: readonly (readonly string[])[]
): Pair[] {
  return stacks.map((ground) => ({
    what: `${what}, on ${ground.join(" over ")}`,
    fore,
    ground,
  }));
}

const text: readonly Pair[] = [
  // Button.
  { what: "a primary button", fore: surface, ground: ["--ac-l"] },
  {
    what: "a primary button under the pointer",
    fore: surface,
    ground: ["--ac-l"],
    brightness: 1.08,
  },
  {
    what: "a primary button held down",
    fore: surface,
    ground: ["--ac-l"],
    brightness: 0.92,
  },
  { what: "a destructive primary button", fore: surface, ground: ["--err-fg"] },
  {
    what: "a destructive primary button under the pointer",
    fore: surface,
    ground: ["--err-fg"],
    brightness: 1.08,
  },
  {
    what: "a destructive primary button held down",
    fore: surface,
    ground: ["--err-fg"],
    brightness: 0.92,
  },
  ...onEach("a bordered button", "--t1", [surface], [hover], [active]),
  {
    what: "a soft destructive button",
    fore: "--err-fg",
    ground: ["--err-bg", surface],
  },
  ...onEach("a text button", "--ac-t", [surface], [page], [elevated], [hover]),
  ...onEach("a destructive text button", "--err-fg", [surface], [page]),

  // Badge.
  ...tones.flatMap(({ tint }) =>
    onEach("a badge", "--t1", ...grounds.map((ground) => [tint, ground])),
  ),
  { what: "a neutral badge", fore: "--t2", ground: [elevated] },

  // Chip.
  ...onEach("a chip", "--t2", [surface]),
  ...onEach("a chip under the pointer", "--t1", [hover]),
  { what: "a pressed chip", fore: "--ac-t", ground: ["--ac-m", surface] },

  // SegmentedControl.
  ...onEach("a segment that is not chosen", "--t2", [elevated]),
  ...onEach("a segment under the pointer", "--t1", [elevated]),
  ...onEach("the chosen segment", "--t1", [surface]),

  // Tabs.
  ...onEach("a tab that is not active", "--t2", [surface], [page]),
  ...onEach("the active tab", "--t1", [surface], [page]),

  // Input and Select.
  ...onEach(
    "the label and the description of a field",
    "--t2",
    [surface],
    [page],
  ),
  ...onEach("the value of a field", "--t1", [elevated], [surface]),
  ...onEach("the placeholder of a field", "--t2", [elevated], [surface]),
  ...onEach("the error of a field", "--err-fg", [surface], [page]),
  ...onEach("the value of a read-only field", "--t2", [page]),

  // Menu and the list of a Select.
  ...onEach("an entry of a list", "--t1", [surface], [hover]),
  ...onEach("the text at the end of an entry", "--t2", [surface], [hover]),
  ...onEach("the heading of a group of entries", "--t3", [surface]),
  ...onEach("a destructive entry", "--err-fg", [surface], [hover]),

  // Tooltip, Popover, Dialog, Drawer, Toast: what floats is a surface.
  ...onEach("the text of what floats", "--t1", [surface]),
  ...onEach("the description of what floats", "--t2", [surface]),
  ...onEach("the lines above and below the title of a drawer", "--t3", [
    surface,
  ]),
  ...onEach("the note in the foot of a dialog", "--t3", [surface]),
  ...onEach("the second line of a toast", "--t3", [surface]),

  // ConfirmDialog: the request lies on the background of the page.
  ...onEach("the method of a request that reads", "--info-fg", [page]),
  ...onEach("the method of a request that writes", "--ok-fg", [page]),
  ...onEach("the method of a request that deletes", "--err-fg", [page]),
  ...onEach("the path and the body of a request", "--t2", [page]),
];

const marks: readonly Pair[] = [
  // IconButton.
  ...onEach("the icon of an icon button", "--t2", [surface], [page]),
  ...onEach("the icon of an icon button under the pointer", "--t1", [hover]),
  {
    what: "the icon of a pressed icon button",
    fore: surface,
    ground: ["--ac-l"],
  },

  // Badge.
  ...tones.flatMap(({ tint, dot }) =>
    onEach(
      "the dot of a badge",
      dot,
      ...grounds.map((ground) => [tint, ground]),
    ),
  ),
  { what: "the dot of a neutral badge", fore: "--t3", ground: [elevated] },

  // Chip: the border that says it is pressed, against what is around the
  // chip and against the chip itself.
  ...onEach(
    "the border of a pressed chip",
    "--ac",
    [surface],
    [page],
    ["--ac-m", surface],
  ),

  // SegmentedControl: the border of the chosen segment, against the track
  // and against the segment.
  ...onEach("the border of the chosen segment", "--ac", [elevated], [surface]),

  // Tabs.
  ...onEach("the line under the active tab", "--ac", [surface], [page]),

  // Input and Select: the boundary against the fill of the field and
  // against what the field lies on.
  ...onEach("the boundary of a field", "--t3", [elevated], [surface], [page]),
  ...onEach(
    "the boundary of an invalid field",
    "--err",
    [elevated],
    [surface],
    [page],
  ),
  ...onEach("the lock of a read-only field", "--t3", [surface], [page]),
  ...onEach("the icon inside a field", "--t3", [elevated], [surface]),

  // Menu and the list of a Select.
  ...onEach("the tick of the chosen entry", "--ac-t", [surface], [hover]),

  // Toast.
  ...["--ok-fg", "--info-fg", "--warn-fg", "--err-fg"].flatMap((dot) =>
    onEach("the dot of a toast", dot, [surface]),
  ),

  // The ring of the focus, on everything a primitive draws it on or
  // around. tokens.test.ts has the plain backgrounds; these are the ones a
  // primitive makes by laying a tint over a surface.
  ...onEach(
    "the ring of the focus",
    "--focus",
    [surface],
    [page],
    [elevated],
    [hover],
    ["--ac-m", surface],
    ["--err-bg", surface],
  ),
];

describe.each([
  { kind: "the text of", pairs: text, least: 4.5 },
  { kind: "a mark, which is", pairs: marks, least: 3 },
])("$kind", ({ pairs, least }) => {
  test.each(pairs)(`$what keeps ${String(least)}:1 in both themes`, (pair) => {
    for (const theme of themes) {
      expect(ratio(pair, theme), theme).toBeGreaterThanOrEqual(least);
    }
  });
});

// The premise of every line above: the arithmetic agrees with the ratios
// doc/ui.md states, to the two places it states them in.
test("the ratios are worked out as the documents state them", () => {
  const stated = (pair: Pair) =>
    themes.map((theme) => ratio(pair, theme).toFixed(2));

  // An opaque pair, a tint over a surface, and a filter.
  expect(stated({ what: "", fore: surface, ground: ["--ac-l"] })).toEqual([
    "5.54",
    "8.23",
  ]);
  expect(
    stated({ what: "", fore: "--ac-t", ground: ["--ac-m", surface] }),
  ).toEqual(["4.82", "6.13"]);
  expect(
    stated({ what: "", fore: surface, ground: ["--ac-l"], brightness: 1.08 }),
  ).toEqual(["5.09", "9.41"]);
});

// What the handoff sets and the primitives do not, and why: each of these
// is below its least in a theme. Were one of them to pass after a change
// of the tokens, its departure in doc/ui.md could be taken back.
test.each<Pair & { least: number }>([
  {
    what: "the tone's own colour as the text of a badge",
    fore: "--ok-fg",
    ground: ["--ok-bg", surface],
    least: 4.5,
  },
  {
    what: "--t3 as text on the elevated background",
    fore: "--t3",
    ground: [elevated],
    least: 4.5,
  },
  {
    what: "--t3 as text on the background of the page",
    fore: "--t3",
    ground: [page],
    least: 4.5,
  },
  {
    what: "--bd as the boundary of a field",
    fore: "--bd",
    ground: [elevated],
    least: 3,
  },
  {
    what: "the solid tone as the dot of a toast",
    fore: "--ok",
    ground: [surface],
    least: 3,
  },
  {
    what: "--t4 as the lock of a read-only field",
    fore: "--t4",
    ground: [surface],
    least: 3,
  },
])("the handoff's $what is below $least:1 in a theme", ({ least, ...pair }) => {
  expect(Math.min(...themes.map((theme) => ratio(pair, theme)))).toBeLessThan(
    least,
  );
});
