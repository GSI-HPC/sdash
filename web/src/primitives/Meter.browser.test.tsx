// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Meter, type MeterLayout } from "./Meter";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

/** The rects of a meter's drawing: the track, the bar, and the marks. */
function rects(meter: Element) {
  const [track, bar, ...marks] = meter.querySelectorAll("svg rect");
  if (!track || !bar) {
    throw new Error("the meter has no track or no bar");
  }
  return { track, bar, marks };
}

test.for(["stacked", "inline", "bare"] as const)(
  "is a meter with its name, its range and its value in words, laid out %s",
  async (layout: MeterLayout) => {
    const screen = await render(
      <Meter label="Example share" value={37} layout={layout} />,
    );

    const meter = screen.getByRole("meter", { name: "Example share" });
    await expect.element(meter).toHaveAttribute("aria-valuemin", "0");
    await expect.element(meter).toHaveAttribute("aria-valuemax", "100");
    await expect.element(meter).toHaveAttribute("aria-valuenow", "37");
    await expect.element(meter).toHaveAttribute("aria-valuetext", "37%");
    expect(
      meter.element().querySelector("svg")?.getAttribute("aria-hidden"),
    ).toBe("true");
  },
);

// What the length shows is on the page in words, for whoever cannot judge
// a length or does not see it; only a meter whose figure stands beside it
// leaves it out.
test("shows its label and its value in words, except when it is bare", async () => {
  const screen = await render(
    <>
      <Meter label="Stacked" value={25} />
      <Meter label="Inline" value={50} layout="inline" />
      <Meter label="Bare" value={75} layout="bare" />
    </>,
  );

  await expect.element(screen.getByText("Stacked")).toBeVisible();
  await expect.element(screen.getByText("25%")).toBeVisible();
  await expect.element(screen.getByText("Inline")).toBeVisible();
  await expect.element(screen.getByText("50%")).toBeVisible();
  expect(
    screen.getByRole("meter", { name: "Bare" }).element().textContent,
  ).toBe("");
});

// The SVG length is a share of the width: the bar is as long as the value
// says at any width. A pixel either way for the rounding of the engines.
test("draws its bar as long as its share of the track", async () => {
  const screen = await render(
    <div className="w-80">
      <Meter label="Example" value={12.5} max={50} layout="bare" />
    </div>,
  );
  const { track, bar } = rects(screen.getByRole("meter").element());

  expect(track.getBoundingClientRect().width).toBe(320);
  expect(Math.abs(bar.getBoundingClientRect().width - 80)).toBeLessThanOrEqual(
    1,
  );
});

test("draws a value outside its range at the nearer end and says it as it is", async () => {
  const screen = await render(
    <>
      <Meter label="Above" value={120} />
      <Meter label="Below" value={-5} />
    </>,
  );
  const above = screen.getByRole("meter", { name: "Above" });
  const below = screen.getByRole("meter", { name: "Below" });

  await expect.element(above).toHaveAttribute("aria-valuenow", "100");
  await expect.element(above).toHaveAttribute("aria-valuetext", "100%");
  await expect.element(below).toHaveAttribute("aria-valuenow", "0");
  expect(rects(above.element()).bar.getAttribute("width")).toBe("100%");
  expect(rects(below.element()).bar.getAttribute("width")).toBe("0%");
});

test('says "No value" for a value that is no number, and draws no bar', async () => {
  const screen = await render(<Meter label="Example" value={Number.NaN} />);
  const meter = screen.getByRole("meter", { name: "Example" });

  await expect.element(meter).toHaveAttribute("aria-valuetext", "No value");
  await expect.element(meter).toHaveAttribute("aria-valuenow", "0");
  await expect.element(screen.getByText("No value")).toBeVisible();
  expect(rects(meter.element()).bar.getAttribute("width")).toBe("0%");
});

test("says its value in the words it is given", async () => {
  const screen = await render(
    <Meter
      label="Example"
      value={12.5}
      max={64}
      format={(value) => `${String(value)} of 64`}
    />,
  );

  await expect
    .element(screen.getByRole("meter"))
    .toHaveAttribute("aria-valuetext", "12.5 of 64");
  await expect.element(screen.getByText("12.5 of 64")).toBeVisible();
});

// A value past a mark is told in three ways: the colour of the bar, the
// end of the bar past the mark on the track, and in words.
test.for(["light", "dark"] as const)(
  "turns to the colour of the mark it passed and names the mark in words, in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const marks = { warn: 75, err: 90 };
    const screen = await render(
      <>
        <Meter label="Fine" value={40} thresholds={marks} />
        <Meter label="Warning" value={80} thresholds={marks} />
        <Meter label="Error" value={96} thresholds={marks} />
      </>,
    );
    const meter = (name: string) => screen.getByRole("meter", { name });
    const fill = (name: string) =>
      getComputedStyle(rects(meter(name).element()).bar).fill;

    expect(fill("Fine")).toBe(colourOf("--ac"));
    expect(fill("Warning")).toBe(colourOf("--warn-fg"));
    expect(fill("Error")).toBe(colourOf("--err-fg"));
    await expect
      .element(meter("Fine"))
      .toHaveAttribute("aria-valuetext", "40%");
    await expect
      .element(meter("Warning"))
      .toHaveAttribute("aria-valuetext", "80%, past the warning mark of 75%");
    await expect
      .element(meter("Error"))
      .toHaveAttribute("aria-valuetext", "96%, past the error mark of 90%");
  },
);

test("passes a mark from above where a low value is the bad one", async () => {
  const screen = await render(
    <Meter
      label="Left"
      value={8}
      thresholds={{ warn: 25, err: 10, direction: "low" }}
    />,
  );

  await expect
    .element(screen.getByRole("meter"))
    .toHaveAttribute("aria-valuetext", "8%, past the error mark of 10%");
});

// The mark is what tells the colour apart without the colour: it stands
// across the bar where the value turns, and out above and below it.
test("stands a mark across its bar where each threshold lies", async () => {
  const screen = await render(
    <div className="w-80">
      <Meter
        label="Example"
        value={50}
        thresholds={{ warn: 75, err: 90 }}
        layout="bare"
      />
    </div>,
  );
  const { track, marks } = rects(screen.getByRole("meter").element());
  const bar = track.getBoundingClientRect();

  expect(marks).toHaveLength(2);
  const centres = marks.map((mark) => {
    const box = mark.getBoundingClientRect();
    expect(box.top).toBeLessThan(bar.top);
    expect(box.bottom).toBeGreaterThan(bar.bottom);
    return (box.left + box.right) / 2 - bar.left;
  });
  expect(Math.abs((centres[0] ?? 0) - 240)).toBeLessThanOrEqual(1);
  expect(Math.abs((centres[1] ?? 0) - 288)).toBeLessThanOrEqual(1);
});

test.for([
  ["sm", 4],
  ["md", 6],
  ["lg", 8],
] as const)("has a bar %s px high", async ([size, height]) => {
  const screen = await render(<Meter label="Example" value={50} size={size} />);

  expect(
    rects(screen.getByRole("meter").element()).track.getBoundingClientRect()
      .height,
  ).toBe(height);
});

// A contrast theme of the system paints everything in a few colours of its
// own; the bar has to stay apart from its track there.
test("keeps its bar apart from its track when the system forces its colours", async () => {
  const screen = await render(<Meter label="Example" value={50} />);
  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);
  const { track, bar } = rects(screen.getByRole("meter").element());

  expect(getComputedStyle(bar).fill).not.toBe(getComputedStyle(track).fill);
});
