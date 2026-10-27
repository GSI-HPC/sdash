// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { Card } from "./Card";

// A card with a title is found by it, as a heading and as a region, by
// whoever moves through a page by either.
test("is a region named by its title, which is a heading of the level it is given", async () => {
  const screen = await render(
    <Card title="Example card" level={3}>
      <p>Example content</p>
    </Card>,
  );

  const region = screen.getByRole("region", { name: "Example card" });
  await expect.element(region).toBeVisible();
  await expect
    .element(region.getByRole("heading", { level: 3, name: "Example card" }))
    .toBeVisible();
  await expect.element(region.getByText("Example content")).toBeVisible();
});

test("has a heading of level 2 unless it is given another", async () => {
  const screen = await render(<Card title="Example card">Example</Card>);

  await expect
    .element(screen.getByRole("heading", { level: 2, name: "Example card" }))
    .toBeVisible();
});

// A region without a name is no landmark, and a surface without a title
// has nothing to be found by.
test("is no region and has no heading without a title", async () => {
  const screen = await render(<Card>Example content</Card>);

  expect(screen.container.querySelector("section")).toBeNull();
  expect(screen.container.querySelector("h2, h3, h4")).toBeNull();
  await expect.element(screen.getByText("Example content")).toBeVisible();
});

test("puts its action at the end of its header and its footer below the content", async () => {
  const screen = await render(
    <Card
      title="Example card"
      action={<a href="#more">More examples</a>}
      footer="Example footer"
    >
      Example content
    </Card>,
  );
  const box = (text: string) =>
    screen.getByText(text).element().getBoundingClientRect();

  expect(box("More examples").right).toBeGreaterThan(box("Example card").right);
  expect(
    Math.abs(box("More examples").top - box("Example card").top),
  ).toBeLessThan(4);
  expect(box("Example footer").top).toBeGreaterThanOrEqual(
    box("Example content").bottom,
  );
});

// A card stands in a column of a view that may be narrower than a phone.
// Its content has to fit or break, and never push the card wider.
test("is no wider than the column it is in, whatever its content", async () => {
  const screen = await render(
    <div className="w-60">
      <Card
        title="Example card with a title that is longer than the room"
        action={<a href="#more">More examples</a>}
      >
        <p className="wrap-anywhere">
          example-of-one-long-word-that-has-no-place-to-break-at-all-anywhere
        </p>
      </Card>
    </div>,
  );

  const card = screen.container.querySelector("section");
  expect(card?.getBoundingClientRect().width).toBe(240);
  expect(card?.scrollWidth).toBeLessThanOrEqual(240);
});
