// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { StatCard } from "./StatCard";

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
});

test("is a region named by its label, which holds the figure, its unit and the line below", async () => {
  const screen = await render(
    <StatCard
      label="Example figure"
      value="1,024"
      unit="GB"
      aside="of 2,048"
      detail="Half of the whole"
    />,
  );

  const region = screen.getByRole("region", { name: "Example figure" });
  await expect
    .element(region.getByRole("heading", { level: 2, name: "Example figure" }))
    .toBeVisible();
  for (const text of ["1,024", "GB", "of 2,048", "Half of the whole"]) {
    await expect.element(region.getByText(text)).toBeVisible();
  }
});

// The figure is what the card is for: larger than anything else in it.
test("sets the figure larger than its label and its unit", async () => {
  const screen = await render(
    <StatCard label="Example figure" value="37" unit="%" />,
  );
  const size = (text: string) =>
    parseFloat(getComputedStyle(screen.getByText(text).element()).fontSize);

  expect(size("37")).toBe(26);
  expect(size("37")).toBeGreaterThan(size("%"));
  expect(size("37")).toBeGreaterThan(size("Example figure"));
});

// The handoff's --t3 is below 4.5:1 on the page, so the card is the
// ground of the label; styles/pairs.test.ts holds the pair.
test.for(["light", "dark"] as const)(
  "sets its label in --t3 on the surface of the card in the %s theme",
  async (theme) => {
    document.documentElement.dataset.theme = theme;
    const screen = await render(<StatCard label="Example figure" value="1" />);
    const label = screen.getByText("Example figure").element();
    const card = screen.getByRole("region").element();

    expect(getComputedStyle(label).color).toBe(colourOf("--t3"));
    expect(getComputedStyle(card).backgroundColor).toBe(
      colourOf("--bg-surface"),
    );
  },
);

test("holds a graphic of its figure below everything else", async () => {
  const screen = await render(
    <StatCard label="Example share" value="37" detail="Example detail">
      <svg
        role="img"
        aria-label="Example graphic"
        className="block h-2 w-full"
      />
    </StatCard>,
  );

  const graphic = screen.getByRole("img", { name: "Example graphic" });
  await expect.element(graphic).toBeVisible();
  expect(graphic.element().getBoundingClientRect().top).toBeGreaterThan(
    screen.getByText("Example detail").element().getBoundingClientRect().bottom,
  );
});
