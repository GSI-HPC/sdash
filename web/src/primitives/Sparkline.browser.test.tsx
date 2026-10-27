// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Sparkline } from "./Sparkline";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

test("is an image whose text says what the line shows", async () => {
  const screen = await render(
    <Sparkline
      label="Example series"
      values={[1200, 900, 1500]}
      format={(value) => `${String(value)} GB`}
    />,
  );

  await expect
    .element(
      screen.getByRole("img", {
        name: "Example series: 3 values, from 1200 GB to 1500 GB, lowest 900 GB, highest 1500 GB",
      }),
    )
    .toBeVisible();
});

test("writes its values in British English unless told otherwise", async () => {
  const screen = await render(
    <Sparkline label="Example" values={[1024, 2048.5]} />,
  );

  await expect
    .element(screen.getByRole("img"))
    .toHaveAccessibleName(
      "Example: 2 values, from 1,024 to 2,048.5, lowest 1,024, highest 2,048.5",
    );
});

test("leaves out a value that is no number", async () => {
  const screen = await render(
    <Sparkline label="Example" values={[3, Number.NaN, 5]} />,
  );

  await expect
    .element(screen.getByRole("img"))
    .toHaveAccessibleName(
      "Example: 2 values, from 3 to 5, lowest 3, highest 5",
    );
});

test("draws nothing and says so when there are no values", async () => {
  const screen = await render(<Sparkline label="Example" values={[]} />);

  await expect
    .element(screen.getByRole("img"))
    .toHaveAccessibleName("Example: no values");
  expect(screen.container.querySelector("polyline")).toBeNull();
});

// The drawing is stretched to its box; the line keeps its width all the
// same, and the box its height.
test("fills the width of its box, 28 px high, with a line 1.5 px wide", async () => {
  const screen = await render(
    <div className="w-60">
      <Sparkline label="Example" values={[1, 4, 2, 8]} />
    </div>,
  );
  const box = screen.getByRole("img").element().getBoundingClientRect();
  const line = screen.container.querySelector("polyline");

  expect(box.width).toBe(240);
  expect(box.height).toBe(28);
  expect(line && getComputedStyle(line).strokeWidth).toBe("1.5px");
  expect(line?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
});

test.for(["light", "dark"] as const)(
  "draws its line in the colour of its tone in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Sparkline label="Accent" values={[1, 2]} />
        <Sparkline label="Fine" values={[1, 2]} tone="ok" />
      </>,
    );
    const stroke = (name: RegExp) =>
      getComputedStyle(
        screen
          .getByRole("img", { name })
          .element()
          .querySelector("polyline") as Element,
      ).stroke;

    expect(stroke(/^Accent/)).toBe(colourOf("--ac"));
    expect(stroke(/^Fine/)).toBe(colourOf("--ok-fg"));
  },
);

test("draws its line in the colour of text and no area when the system forces its colours", async () => {
  const screen = await render(<Sparkline label="Example" values={[1, 2, 1]} />);
  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  const line = screen.container.querySelector("polyline");
  const area = screen.container.querySelector("polygon");
  expect(line && getComputedStyle(line).stroke).toBe(
    getComputedStyle(document.body).color,
  );
  expect(area && getComputedStyle(area).fill).toBe("none");
});
