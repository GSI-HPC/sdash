// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import {
  SegmentedControl,
  type SegmentedControlProps,
} from "./SegmentedControl";

const root = document.documentElement;

type Choice = "first" | "second" | "third";

const options = [
  { value: "first", label: "First option" },
  { value: "second", label: "Second option" },
  { value: "third", label: "Third option" },
] as const;

/**
 * A segmented control that keeps its own choice, as the view that owns it
 * would, and writes every change down.
 */
function Choose({
  initially = "first",
  changes = [],
  ...control
}: Partial<SegmentedControlProps<Choice>> & {
  initially?: Choice;
  changes?: Choice[];
}) {
  const [value, setValue] = useState<Choice>(initially);
  return (
    <SegmentedControl
      label="Example choice"
      options={options}
      {...control}
      value={value}
      onValueChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
    />
  );
}

/** The labels of the options that say they are chosen. */
function chosen(): (string | null)[] {
  return [
    ...document.querySelectorAll('[role="radio"][aria-checked="true"]'),
  ].map((option) => option.textContent);
}

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

// A radio group says what a segmented control is: a set of options with
// a name, of which exactly one is chosen (WCAG 2.1, success criteria
// 1.3.1 and 4.1.2).
test("is a radio group named by its label with one option chosen", async () => {
  const screen = await render(<Choose initially="second" />);

  await expect
    .element(screen.getByRole("radiogroup", { name: "Example choice" }))
    .toBeVisible();
  expect(
    screen
      .getByRole("radio")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["First option", "Second option", "Third option"]);
  await expect
    .element(screen.getByRole("radio", { name: "Second option" }))
    .toBeChecked();
  expect(chosen()).toEqual(["Second option"]);
});

// WAI-ARIA's radio group: the arrow keys move the focus and the choice
// together, in both directions and both axes, and go round at the ends.
test("moves the choice with the arrow keys and wraps", async () => {
  const changes: Choice[] = [];
  const screen = await render(<Choose changes={changes} />);
  const option = (name: string) => screen.getByRole("radio", { name });
  await userEvent.tab();
  await expect.element(option("First option")).toHaveFocus();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(option("Second option")).toHaveFocus();
  await expect.element(option("Second option")).toBeChecked();

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(option("Third option")).toBeChecked();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(option("First option")).toHaveFocus();
  await expect.element(option("First option")).toBeChecked();

  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(option("Third option")).toBeChecked();

  await userEvent.keyboard("{ArrowUp}");
  await expect.element(option("Second option")).toBeChecked();

  expect(changes).toEqual(["second", "third", "first", "third", "second"]);
  expect(chosen()).toEqual(["Second option"]);
});

// The group is one control to the Tab key, which enters it where the
// choice is and leaves it with the next press.
test("is one stop of the Tab key, on the chosen option", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <Choose initially="third" />
      <button type="button">After</button>
    </>,
  );

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Before" }))
    .toHaveFocus();
  await userEvent.tab();
  await expect
    .element(screen.getByRole("radio", { name: "Third option" }))
    .toHaveFocus();
  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "After" }))
    .toHaveFocus();

  await userEvent.tab({ shift: true });
  await expect
    .element(screen.getByRole("radio", { name: "Third option" }))
    .toHaveFocus();
});

test("chooses by a click", async () => {
  const changes: Choice[] = [];
  const screen = await render(<Choose changes={changes} />);

  await screen.getByRole("radio", { name: "Third option" }).click();

  await expect
    .element(screen.getByRole("radio", { name: "Third option" }))
    .toBeChecked();
  expect(chosen()).toEqual(["Third option"]);
  // A press on the chosen option changes nothing: one is always chosen.
  await screen.getByRole("radio", { name: "Third option" }).click();
  expect(changes).toEqual(["third"]);
  expect(chosen()).toEqual(["Third option"]);
});

test("is chosen by Space where the focus is", async () => {
  const changes: Choice[] = [];
  function Page() {
    const [value, setValue] = useState<Choice>("first");
    return (
      <>
        <SegmentedControl
          label="Example choice"
          options={options}
          value={value}
          onValueChange={(next) => {
            changes.push(next);
            setValue(next);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setValue("second");
          }}
        >
          Choose the second
        </button>
      </>
    );
  }
  const screen = await render(<Page />);
  await userEvent.tab();
  const first = screen.getByRole("radio", { name: "First option" });
  await expect.element(first).toHaveFocus();
  // The view changes the choice while the focus stays where it was.
  await screen.getByRole("button", { name: "Choose the second" }).click();
  await expect
    .element(screen.getByRole("radio", { name: "Second option" }))
    .toBeChecked();

  first.element().focus();
  await userEvent.keyboard(" ");

  await expect.element(first).toBeChecked();
  expect(changes).toEqual(["first"]);
});

// The handoff tells the chosen segment from the others by the surface
// colour on the elevated track, 1.1:1, and a shadow. The border in the
// accent is what reaches 3:1 (WCAG 2.1, success criterion 1.4.11), and
// the others are --t2 where the handoff's --t3 is below 4.5:1.
// styles/pairs.test.ts holds each pair to its ratio; this test ties the
// control to the pairs.
test.for(["light", "dark"] as const)(
  "marks the chosen option with a border of its own in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Choose />
        <p>Somewhere else</p>
      </>,
    );
    // The tests of this file share one pointer, and an option under it
    // has the text colour of its hover.
    await screen.getByText("Somewhere else").hover();
    const style = (name: string) =>
      getComputedStyle(screen.getByRole("radio", { name }).element());
    const marked = style("First option");
    const other = style("Second option");

    expect(marked.borderTopColor).toBe(colourOf("--ac"));
    expect(marked.borderTopWidth).toBe("1px");
    expect(marked.backgroundColor).toBe(colourOf("--bg-surface"));
    expect(marked.color).toBe(colourOf("--t1"));
    expect(other.borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(other.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(other.color).toBe(colourOf("--t2"));
    expect(
      getComputedStyle(screen.getByRole("radiogroup").element())
        .backgroundColor,
    ).toBe(colourOf("--bg-elevated"));

    // Under the pointer an option that is not chosen has the text colour
    // of the chosen one, and nothing else of it.
    await screen.getByRole("radio", { name: "Second option" }).hover();
    await expect
      .poll(() => style("Second option").color)
      .toBe(colourOf("--t1"));
    expect(style("Second option").borderTopColor).toBe("rgba(0, 0, 0, 0)");
  },
);

// WCAG 2.1, success criterion 2.4.7: the ring is the stylesheet's, around
// the option that has the focus.
test("shows the ring of the keyboard focus on the option that has it", async () => {
  const screen = await render(<Choose />);

  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");

  const option = screen.getByRole("radio", { name: "Second option" });
  await expect.element(option).toHaveFocus();
  const style = getComputedStyle(option.element());
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("2px");
  expect(style.outlineColor).toBe(colourOf("--focus"));
});

// A segmented control stands in a row with buttons and fields, so it is
// as high as they are at its size: 32 and 28 px. Its smallest segment is
// 24 px high, where the handoff's is 20.
//
// The handoff draws the one on the page with a border around its track
// and the small one of the status popover without. The border takes one of
// the 2 px the track has around its segments, so that the control with it
// is no higher than the scale has it.
test("is as high as a control of its size, with segments no lower than 24 px", async () => {
  const screen = await render(
    <>
      <Choose />
      <Choose label="Another choice" size="sm" />
    </>,
  );
  const heights = (name: string) => {
    const group = screen.getByRole("radiogroup", { name });
    return {
      control: group.element().getBoundingClientRect().height,
      segment: group
        .getByRole("radio", { name: "First option" })
        .element()
        .getBoundingClientRect().height,
    };
  };

  expect(heights("Example choice")).toEqual({ control: 32, segment: 28 });
  expect(heights("Another choice")).toEqual({ control: 28, segment: 24 });
  const track = (name: string) =>
    getComputedStyle(screen.getByRole("radiogroup", { name }).element());
  expect(track("Example choice").borderTopWidth).toBe("1px");
  expect(track("Example choice").borderTopColor).toBe(colourOf("--bd"));
  expect(track("Another choice").borderTopWidth).toBe("0px");
});

// A row of options too long for its place goes on in a second line and
// does not make the page scroll sideways (WCAG 2.1, success criterion
// 1.4.10).
test("wraps where its row is too long for its place", async () => {
  const screen = await render(
    <div className="w-40">
      <Choose />
    </div>,
  );
  const group = screen.getByRole("radiogroup").element();
  const tops = new Set(
    screen
      .getByRole("radio")
      .elements()
      .map((option) => option.getBoundingClientRect().top),
  );

  expect(tops.size).toBeGreaterThan(1);
  expect(group.getBoundingClientRect().width).toBeLessThanOrEqual(160);
  expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
});

// A contrast theme of the system removes the fill and the shadow and
// paints every border in one colour: the chosen option is then told from
// the others by the width of its border.
test("has a thicker border on the chosen option while the system forces its colours", async () => {
  const screen = await render(<Choose />);
  const width = (name: string) =>
    getComputedStyle(screen.getByRole("radio", { name }).element())
      .borderTopWidth;

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(width("First option")).toBe("2px");
  expect(width("Second option")).toBe("1px");
  expect(
    getComputedStyle(
      screen.getByRole("radio", { name: "Second option" }).element(),
    ).borderTopColor,
  ).not.toBe("rgba(0, 0, 0, 0)");
});
