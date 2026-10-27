// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { type BarPart, StackedBar } from "./StackedBar";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

const parts: readonly BarPart[] = [
  { label: "First part", value: 42, tone: "ok" },
  { label: "Second part", value: 18, tone: "warn" },
  { label: "Third part", value: 1200, tone: "err" },
];

/** The rects that draw the parts, in the order of the parts. */
function partRects(group: Element): SVGRectElement[] {
  return [...group.querySelectorAll<SVGRectElement>("g rect")]
    .filter((rect) => rect.getAttribute("width") !== "1")
    .slice(1);
}

// The legend is what the bar says, in words, and it is all assistive
// technology is told: the drawing is hidden from it.
test("is a group named by its label whose legend lists each part with its value", async () => {
  const screen = await render(
    <StackedBar label="Example parts" parts={parts} />,
  );

  const group = screen.getByRole("group", { name: "Example parts" });
  await expect.element(group).toBeVisible();
  expect(
    group
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["First part42", "Second part18", "Third part1,200"]);
  expect(
    group.element().querySelector("svg")?.getAttribute("aria-hidden"),
  ).toBe("true");
});

test("lists what the parts leave of the whole as the rest", async () => {
  const screen = await render(
    <StackedBar
      label="Example"
      parts={parts.slice(0, 2)}
      total={100}
      restLabel="Left over"
    />,
  );

  expect(
    screen
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["First part42", "Second part18", "Left over40"]);
});

// React tells of two items with one key, and may then drop one of them.
test("lists a part named as the rest beside the rest", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const screen = await render(
    <StackedBar
      label="Example"
      parts={[{ label: "Rest", value: 30, tone: "neutral" }]}
      total={100}
    />,
  );

  expect(
    screen
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["Rest30", "Rest70"]);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

// SVG lengths in percent: each part is as long as its share at any width,
// with a pixel either way for the rounding of the engines.
test("draws each part as long as its share of the whole, one after the other", async () => {
  const screen = await render(
    <div className="w-100">
      <StackedBar
        label="Example"
        parts={[
          { label: "Quarter", value: 25, tone: "ok" },
          { label: "Half", value: 50, tone: "info" },
        ]}
        total={100}
      />
    </div>,
  );
  const [quarter, half] = partRects(screen.getByRole("group").element()).map(
    (rect) => rect.getBoundingClientRect(),
  );
  const left = screen.getByRole("group").element().getBoundingClientRect().left;

  expect(Math.abs((quarter?.width ?? 0) - 100)).toBeLessThanOrEqual(1);
  expect(Math.abs((half?.width ?? 0) - 200)).toBeLessThanOrEqual(1);
  expect(Math.abs((half?.left ?? 0) - left - 100)).toBeLessThanOrEqual(1);
});

// Two neighbouring parts need not differ from each other by 3:1: a gap in
// the colour of the track stands between them, and each part stands 3:1
// against the track (styles/pairs.test.ts).
test("keeps neighbouring parts apart by a gap in the colour of the track", async () => {
  const screen = await render(
    <StackedBar label="Example" parts={parts.slice(0, 2)} total={100} />,
  );
  const gaps = [
    ...screen.getByRole("group").element().querySelectorAll('rect[width="1"]'),
  ];

  expect(gaps.map((gap) => gap.getAttribute("x"))).toEqual(["42%"]);
  for (const gap of gaps) {
    expect(getComputedStyle(gap).fill).toBe(colourOf("--bg-elevated"));
  }
});

test("draws no gap after the last part, whether the rest follows it or not", async () => {
  const screen = await render(
    <>
      <StackedBar label="Filled" parts={parts.slice(0, 2)} />
      <StackedBar label="With a rest" parts={parts.slice(0, 2)} total={100} />
    </>,
  );
  const gaps = (name: string) =>
    screen
      .getByRole("group", { name })
      .element()
      .querySelectorAll('rect[width="1"]').length;

  expect(gaps("Filled")).toBe(1);
  expect(gaps("With a rest")).toBe(1);
});

test("lists a part of none and draws nothing of it", async () => {
  const screen = await render(
    <StackedBar
      label="Example"
      parts={[
        { label: "Some", value: 3, tone: "info" },
        { label: "None", value: 0, tone: "vio" },
        { label: "Less than none", value: -2, tone: "org" },
      ]}
    />,
  );

  expect(
    screen
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["Some3", "None0", "Less than none0"]);
  expect(partRects(screen.getByRole("group").element())).toHaveLength(1);
});

test.for(["light", "dark"] as const)(
  "fills each part with the text colour of its tone, as its swatch in the legend, in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(<StackedBar label="Example" parts={parts} />);
    const group = screen.getByRole("group").element();
    const swatches = [...group.querySelectorAll("li > span:first-child")];

    const expected = ["--ok-fg", "--warn-fg", "--err-fg"].map(colourOf);
    expect(partRects(group).map((rect) => getComputedStyle(rect).fill)).toEqual(
      expected,
    );
    expect(
      swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
    ).toEqual(expected);
  },
);

test("draws its parts in one colour and its gaps in another when the system forces its colours", async () => {
  const screen = await render(<StackedBar label="Example" parts={parts} />);
  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);
  const group = screen.getByRole("group").element();
  const fills = new Set(
    partRects(group).map((rect) => getComputedStyle(rect).fill),
  );
  const gap = group.querySelector('rect[width="1"]');

  expect(fills.size).toBe(1);
  expect(gap && getComputedStyle(gap).fill).not.toBe([...fills][0]);
});
