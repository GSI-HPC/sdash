// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

const root = document.documentElement;

type Part = "first" | "second" | "third" | "fourth";

/**
 * Four tabs that keep which one is selected, as the view that owns them
 * would, and write every change down. The third can be disabled.
 */
function Parts({
  initially = "first",
  changes = [],
  thirdDisabled = false,
}: {
  initially?: Part;
  changes?: Part[];
  thirdDisabled?: boolean;
}) {
  const [part, setPart] = useState<Part>(initially);
  return (
    <>
      <button type="button">Before</button>
      <Tabs
        value={part}
        onValueChange={(next) => {
          changes.push(next);
          setPart(next);
        }}
      >
        <TabList label="Example details">
          <Tab value="first">First tab</Tab>
          <Tab value="second">Second tab</Tab>
          <Tab value="third" disabled={thirdDisabled}>
            Third tab
          </Tab>
          <Tab value="fourth">Fourth tab</Tab>
        </TabList>
        <TabPanel value="first">The first panel.</TabPanel>
        <TabPanel value="second">The second panel.</TabPanel>
        <TabPanel value="third">The third panel.</TabPanel>
        <TabPanel value="fourth">The fourth panel.</TabPanel>
      </Tabs>
      <button type="button">After</button>
    </>
  );
}

/** The names of the tabs that say they are selected. */
function selected(): (string | null)[] {
  return [
    ...document.querySelectorAll('[role="tab"][aria-selected="true"]'),
  ].map((tab) => tab.textContent);
}

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

// WAI-ARIA's tabs: a list with a name, tabs that say which of them is
// selected, and each tab tied to the panel it controls (WCAG 2.1, success
// criteria 1.3.1 and 4.1.2).
test("is a tab list named by its label with one tab selected", async () => {
  const screen = await render(<Parts initially="second" />);

  await expect
    .element(screen.getByRole("tablist", { name: "Example details" }))
    .toBeVisible();
  expect(
    screen
      .getByRole("tab")
      .elements()
      .map((tab) => tab.textContent),
  ).toEqual(["First tab", "Second tab", "Third tab", "Fourth tab"]);
  expect(selected()).toEqual(["Second tab"]);
  const tab = screen.getByRole("tab", { name: "Second tab" });
  const panel = screen.getByRole("tabpanel", { name: "Second tab" });
  await expect
    .element(tab)
    .toHaveAttribute("aria-controls", panel.element().id);
});

test("shows the panel of the selected tab and no other", async () => {
  const screen = await render(<Parts />);

  await expect
    .element(screen.getByRole("tabpanel", { name: "First tab" }))
    .toHaveTextContent("The first panel.");
  expect(screen.getByRole("tabpanel").elements()).toHaveLength(1);
  await expect
    .element(screen.getByText("The second panel."))
    .not.toBeInTheDocument();

  await screen.getByRole("tab", { name: "Second tab" }).click();

  await expect
    .element(screen.getByRole("tabpanel", { name: "Second tab" }))
    .toHaveTextContent("The second panel.");
  expect(screen.getByRole("tabpanel").elements()).toHaveLength(1);
  await expect
    .element(screen.getByText("The first panel."))
    .not.toBeInTheDocument();
});

// The panel shows without delay, so the pattern has a tab activated by
// the focus arriving on it: one key press, not two.
test("moves and activates with the arrow keys, Home and End", async () => {
  const changes: Part[] = [];
  const screen = await render(<Parts changes={changes} />);
  const tab = (name: string) => screen.getByRole("tab", { name });
  await userEvent.tab();
  await userEvent.tab();
  await expect.element(tab("First tab")).toHaveFocus();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab("Second tab")).toHaveFocus();
  await expect
    .element(screen.getByRole("tabpanel", { name: "Second tab" }))
    .toBeVisible();

  await userEvent.keyboard("{End}");
  await expect.element(tab("Fourth tab")).toHaveFocus();
  // Round at the end, and back.
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab("First tab")).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(tab("Fourth tab")).toHaveFocus();
  await userEvent.keyboard("{Home}");
  await expect.element(tab("First tab")).toHaveFocus();

  expect(changes).toEqual(["second", "fourth", "first", "fourth", "first"]);
  expect(selected()).toEqual(["First tab"]);
  await expect
    .element(screen.getByRole("tabpanel", { name: "First tab" }))
    .toBeVisible();
});

// The list is one control to the Tab key. The panel is the next stop, so
// that a panel with nothing to press in it is reached and read, and can be
// scrolled.
test("is one stop of the Tab key, and the next is the panel", async () => {
  const screen = await render(<Parts initially="third" />);

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Before" }))
    .toHaveFocus();
  await userEvent.tab();
  await expect
    .element(screen.getByRole("tab", { name: "Third tab" }))
    .toHaveFocus();
  await userEvent.tab();
  const panel = screen.getByRole("tabpanel", { name: "Third tab" });
  await expect.element(panel).toHaveFocus();
  // The ring of the panel is drawn inside its edge.
  const ring = getComputedStyle(panel.element());
  expect(ring.outlineStyle).toBe("solid");
  expect(ring.outlineOffset).toBe("-2px");
  expect(ring.outlineColor).toBe(colourOf("--focus"));

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "After" }))
    .toHaveFocus();
});

// A tab that cannot be gone to is still a stop of the arrow keys, as Base
// UI has it for the parts of every composite control: a screen reader
// user learns that it is there and that it is disabled. The focus on it
// selects nothing, so the panel stays the one of the tab before.
test("stops on a disabled tab, which says that it is disabled, and does not show its panel", async () => {
  const changes: Part[] = [];
  const screen = await render(<Parts changes={changes} thirdDisabled />);
  const disabled = screen.getByRole("tab", { name: "Third tab" });
  await expect.element(disabled).toHaveAttribute("aria-disabled", "true");
  expect(getComputedStyle(disabled.element()).cursor).toBe("not-allowed");
  // Its text is dimmed and the tab is not: opacity on the tab would dim
  // the ring of its focus with it, to 1.9:1 in the light theme.
  const text = disabled.element().firstElementChild;
  expect(text && getComputedStyle(text).opacity).toBe("0.45");
  expect(getComputedStyle(disabled.element()).opacity).toBe("1");

  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");

  await expect.element(disabled).toHaveFocus();
  expect(getComputedStyle(disabled.element()).outlineColor).toBe(
    colourOf("--focus"),
  );
  expect(selected()).toEqual(["Second tab"]);
  await expect
    .element(screen.getByRole("tabpanel", { name: "Second tab" }))
    .toBeVisible();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard(" ");
  // Forced, because a tab that cannot be gone to is no target.
  await disabled.click({ force: true });
  expect(selected()).toEqual(["Second tab"]);

  await userEvent.keyboard("{ArrowRight}");
  await expect
    .element(screen.getByRole("tab", { name: "Fourth tab" }))
    .toHaveFocus();
  expect(changes).toEqual(["second", "fourth"]);
  expect(selected()).toEqual(["Fourth tab"]);
});

// The line in the accent is what marks the selected tab at 3:1 (WCAG 2.1,
// success criterion 1.4.11). The others are --t2, where the handoff's --t3
// is below 4.5:1 on the page in the light theme. styles/pairs.test.ts
// holds each pair to its ratio; this test ties the tabs to the pairs.
test.for(["light", "dark"] as const)(
  "draws the line under the active tab only in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Parts />
        <p>Somewhere else</p>
      </>,
    );
    // The tests of this file share one pointer, and a tab under it has
    // the text colour of its hover.
    await screen.getByText("Somewhere else").hover();
    const style = (name: string) =>
      getComputedStyle(screen.getByRole("tab", { name }).element());
    const active = style("First tab");
    const other = style("Second tab");

    expect(active.borderBottomWidth).toBe("2px");
    expect(active.borderBottomStyle).toBe("solid");
    expect(active.borderBottomColor).toBe(colourOf("--ac"));
    expect(active.color).toBe(colourOf("--t1"));
    expect(other.borderBottomWidth).toBe("0px");
    expect(other.color).toBe(colourOf("--t2"));

    // Under the pointer a tab has the text colour of the active one, and
    // no line.
    await screen.getByRole("tab", { name: "Second tab" }).hover();
    await expect.poll(() => style("Second tab").color).toBe(colourOf("--t1"));
    expect(style("Second tab").borderBottomWidth).toBe("0px");
  },
);

// The line takes the place of padding and does not add to the tab, or the
// row would shift by two pixels with every change of tab.
test("keeps every tab where it is when the selection moves", async () => {
  const screen = await render(<Parts />);
  const boxes = () =>
    screen
      .getByRole("tab")
      .elements()
      .map((tab) => {
        const { left, top, width, height } = tab.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(tab);
        return [left, top, width, height, text.getBoundingClientRect().top];
      });
  const before = boxes();

  await screen.getByRole("tab", { name: "Fourth tab" }).click();
  await expect
    .element(screen.getByRole("tabpanel", { name: "Fourth tab" }))
    .toBeVisible();

  expect(boxes()).toEqual(before);
  expect(before[0]?.[3]).toBe(34);
});

// A row of tabs too long for its place goes on in a second line and does
// not make the page scroll sideways (WCAG 2.1, success criterion 1.4.10).
test("wraps where its row is too long for its place", async () => {
  const screen = await render(
    <div className="w-40">
      <Parts />
    </div>,
  );
  const list = screen.getByRole("tablist").element();
  const tops = new Set(
    screen
      .getByRole("tab")
      .elements()
      .map((tab) => tab.getBoundingClientRect().top),
  );

  expect(tops.size).toBeGreaterThan(1);
  expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
});

// A contrast theme of the system paints every border, a transparent one
// too. A tab that is not selected has no border at all, so that the line
// still says which one is.
test("has a line under the active tab and none under the others while the system forces its colours", async () => {
  const screen = await render(<Parts />);
  const style = (name: string) =>
    getComputedStyle(screen.getByRole("tab", { name }).element());

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(style("First tab").borderBottomWidth).toBe("2px");
  expect(style("First tab").borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(style("Second tab").borderBottomWidth).toBe("0px");
  expect(style("Fourth tab").borderBottomWidth).toBe("0px");
});
