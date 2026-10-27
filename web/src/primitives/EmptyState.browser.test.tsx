// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
});

test("says that there is nothing, why, and offers what would change it", async () => {
  const screen = await render(
    <EmptyState
      title="Nothing matches."
      action={<Button size="sm">Clear the filters</Button>}
    >
      Clear a filter to see more.
    </EmptyState>,
  );

  await expect.element(screen.getByText("Nothing matches.")).toBeVisible();
  await expect
    .element(screen.getByText("Clear a filter to see more."))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Clear the filters" }))
    .toBeVisible();
});

// Most empty states stand inside something that has a heading already: a
// card, a table. One that is all a view has needs one of its own.
test("is a heading only when it is given a level", async () => {
  const screen = await render(
    <>
      <EmptyState title="Without a level" />
      <EmptyState title="With a level" level={3} />
    </>,
  );

  expect(screen.getByText("Without a level").element().tagName).toBe("P");
  await expect
    .element(screen.getByRole("heading", { level: 3, name: "With a level" }))
    .toBeVisible();
});

// The handoff's --t3 stands 4.4:1 on the page in the light theme, and an
// empty state lies on the page as well as on a card.
test.for(["light", "dark"] as const)(
  "sets its title in --t1 and its text in --t2 in the %s theme",
  async (theme) => {
    document.documentElement.dataset.theme = theme;
    const screen = await render(
      <EmptyState title="Example title">Example text</EmptyState>,
    );
    const colour = (text: string) =>
      getComputedStyle(screen.getByText(text).element()).color;

    expect(colour("Example title")).toBe(colourOf("--t1"));
    expect(colour("Example text")).toBe(colourOf("--t2"));
  },
);
