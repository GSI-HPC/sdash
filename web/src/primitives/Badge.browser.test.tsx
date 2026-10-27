// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Badge, type BadgeTone } from "./Badge";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

// The text is the badge. The dot repeats its tone in colour and would be
// read as nothing, or as "image", if assistive technology were shown it
// (WCAG 2.1, success criterion 1.4.1). A badge is no control: it has no
// role and no place in the order of the Tab key.
test("says its text and hides its dot from assistive technology", async () => {
  const screen = await render(
    <Badge tone="ok" dot>
      Example ready
    </Badge>,
  );
  const badge = screen.getByText("Example ready").element();

  expect(badge.textContent).toBe("Example ready");
  expect(badge.hasAttribute("role")).toBe(false);
  expect(badge.hasAttribute("tabindex")).toBe(false);
  const dot = badge.querySelector("span");
  expect(dot?.getAttribute("aria-hidden")).toBe("true");
  expect(dot?.textContent).toBe("");
  expect(dot?.getBoundingClientRect().width).toBe(6);
});

test("has no dot unless it is asked for one", async () => {
  const screen = await render(<Badge tone="ok">Example ready</Badge>);

  expect(
    screen.getByText("Example ready").element().querySelector("span"),
  ).toBeNull();
});

// A badge stands in a cell of a table or beside a heading. Broken over two
// lines it would be twice as high as the row it is in.
test("keeps its text on one line", async () => {
  const screen = await render(
    <>
      <Badge>Example of some length</Badge>
      <div className="w-8">
        <Badge tone="info">Example of some length, in no room</Badge>
      </div>
    </>,
  );
  const height = (text: string) =>
    screen.getByText(text).element().getBoundingClientRect().height;

  expect(height("Example of some length, in no room")).toBe(
    height("Example of some length"),
  );
});

/** The tokens each tone takes its tint, its text and its dot from. */
const tones: readonly {
  tone: BadgeTone;
  tint: string;
  text: string;
  dot: string;
}[] = [
  { tone: "neutral", tint: "--bg-elevated", text: "--t2", dot: "--t3" },
  { tone: "ok", tint: "--ok-bg", text: "--t1", dot: "--ok-fg" },
  { tone: "warn", tint: "--warn-bg", text: "--t1", dot: "--warn-fg" },
  { tone: "err", tint: "--err-bg", text: "--t1", dot: "--err-fg" },
  { tone: "info", tint: "--info-bg", text: "--t1", dot: "--info-fg" },
  { tone: "vio", tint: "--vio-bg", text: "--t1", dot: "--vio-fg" },
  { tone: "org", tint: "--org-bg", text: "--t1", dot: "--org-fg" },
  { tone: "accent", tint: "--ac-m", text: "--t1", dot: "--ac-t" },
];

// The handoff's coloured text on its tint is below 4.5:1 for two tones in
// the light theme, and its solid dot below 3:1. The pairs used in their
// place are tokens, and styles/pairs.test.ts holds each to its ratio; this
// test is what ties a tone to its pair.
test.for(["light", "dark"] as const)(
  "sets the primary text on the tint of its tone, with a dot in the tone's text colour, in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        {tones.map(({ tone }) => (
          <Badge key={tone} tone={tone} dot>
            {`Example ${tone}`}
          </Badge>
        ))}
      </>,
    );

    for (const { tone, tint, text, dot } of tones) {
      const badge = screen.getByText(`Example ${tone}`).element();
      const style = getComputedStyle(badge);
      expect(style.color, tone).toBe(colourOf(text));
      expect(style.backgroundColor, tone).toBe(colourOf(tint));
      const light = badge.querySelector("span");
      expect(light && getComputedStyle(light).backgroundColor, tone).toBe(
        colourOf(dot),
      );
    }
  },
);

// The three shapes of the handoff: the badge of a table, the small one of
// a dense row, and the pill of the header.
test("is a pill 24 px high when asked, whatever its size", async () => {
  const screen = await render(
    <>
      <Badge>Medium</Badge>
      <Badge size="sm">Small</Badge>
      <Badge pill size="sm">
        Pill
      </Badge>
    </>,
  );
  const style = (text: string) =>
    getComputedStyle(screen.getByText(text).element());

  expect(style("Medium").borderRadius).toBe("4px");
  expect(style("Small").borderRadius).toBe("3px");
  expect(style("Pill").borderRadius).toBe("12px");
  expect(style("Pill").height).toBe("24px");
  expect(parseFloat(style("Small").fontSize)).toBeLessThan(
    parseFloat(style("Medium").fontSize),
  );
});

// A badge stands in the dense rows of a table, and is as high as its text
// makes it. With the line height of the page, half as high again as the
// text, it was 23 and 20 px high where the handoff draws 19 and 15: every
// row with a badge in it grew by that.
test("is 19 px high, and 16 px in its small size, with its border", async () => {
  const screen = await render(
    <>
      <Badge>Medium</Badge>
      <Badge tone="ok" dot>
        With a dot
      </Badge>
      <Badge size="sm">Small</Badge>
    </>,
  );
  const height = (text: string) =>
    Math.round(screen.getByText(text).element().getBoundingClientRect().height);

  expect(height("Medium")).toBe(19);
  expect(height("With a dot")).toBe(19);
  expect(height("Small")).toBe(16);
});

// An id or a path is set in DM Mono wherever it shows. That font has no
// weight above 500: asked for the 600 of a small badge or a pill, the
// browser would thicken the letters itself.
test("sets an id in the monospaced font, at a weight the font has", async () => {
  const screen = await render(
    <>
      <Badge mono>example-17</Badge>
      <Badge mono size="sm">
        example-18
      </Badge>
      <Badge mono pill>
        example-19
      </Badge>
      <Badge size="sm">Example</Badge>
    </>,
  );
  const style = (text: string) =>
    getComputedStyle(screen.getByText(text).element());

  for (const id of ["example-17", "example-18", "example-19"]) {
    expect(style(id).fontFamily, id).toContain("DM Mono");
    expect(style(id).fontWeight, id).toBe("500");
  }
  expect(style("Example").fontFamily).not.toContain("DM Mono");
  expect(style("Example").fontWeight).toBe("600");
});

// A contrast theme of the system removes the tint, which is all that sets
// a badge apart from the text beside it. It paints every border, so the
// transparent one of a badge becomes its boundary there.
test("has a boundary when the system forces its colours", async () => {
  const screen = await render(<Badge tone="warn">Example waiting</Badge>);
  const badge = screen.getByText("Example waiting").element();
  expect(getComputedStyle(badge).borderTopColor).toBe("rgba(0, 0, 0, 0)");

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  const style = getComputedStyle(badge);
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopStyle).toBe("solid");
  expect(style.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
});
