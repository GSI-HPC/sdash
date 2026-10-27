// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Legend } from "./Legend";

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

const items = [
  { label: "First", tone: "ok", value: "12" },
  { label: "Second", tone: "err" },
  { label: "Rest", tone: "rest", value: "3" },
] as const;

// The words are the legend: assistive technology reads a list of them,
// and the swatches, which say nothing in words, are hidden from it.
test("is a list of labels with their values, with the swatches hidden", async () => {
  const screen = await render(<Legend items={items} />);

  expect(
    screen
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["First12", "Second", "Rest3"]);
  for (const swatch of screen.container.querySelectorAll(
    "li > span:first-child",
  )) {
    expect(swatch.getAttribute("aria-hidden")).toBe("true");
  }
});

test("draws each swatch in the colour of its tone, and the rest in the colour of the track", async () => {
  const screen = await render(<Legend items={items} />);
  const swatches = [
    ...screen.container.querySelectorAll("li > span:first-child"),
  ];

  expect(
    swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
  ).toEqual(["--ok-fg", "--err-fg", "--bg-elevated"].map(colourOf));
});

// The system removes the colour of a swatch; the outline keeps it a mark
// beside its label.
test("outlines each swatch when the system forces its colours", async () => {
  const screen = await render(<Legend items={items} />);
  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  for (const swatch of screen.container.querySelectorAll(
    "li > span:first-child",
  )) {
    const style = getComputedStyle(swatch);
    expect(style.borderTopWidth).toBe("1px");
    expect(style.borderTopColor).toBe(getComputedStyle(document.body).color);
  }
});

test("goes on in a second line where it is narrow, and stays as wide as its column", async () => {
  const screen = await render(
    <div className="w-25">
      <Legend items={items} />
    </div>,
  );
  const list = screen.container.querySelector("ul");
  const [first, , last] = screen.getByRole("listitem").elements();

  expect(list?.scrollWidth).toBeLessThanOrEqual(100);
  expect(last?.getBoundingClientRect().top).toBeGreaterThan(
    first?.getBoundingClientRect().top ?? 0,
  );
});
