// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Chip, type ChipProps } from "./Chip";

const root = document.documentElement;

/**
 * A chip that keeps its own state, as the view that owns a filter would,
 * and tells the test of every change.
 */
function Filter({
  initially = false,
  onPressed,
  children,
  ...chip
}: Omit<ChipProps, "pressed" | "onPressedChange"> & {
  initially?: boolean;
  onPressed?: (pressed: boolean) => void;
}) {
  const [pressed, setPressed] = useState(initially);
  return (
    <Chip
      {...chip}
      pressed={pressed}
      onPressedChange={(next) => {
        setPressed(next);
        onPressed?.(next);
      }}
    >
      {children}
    </Chip>
  );
}

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

// WAI-ARIA's button pattern for a toggle: the name stays and the state is
// what changes, so a screen reader announces "pressed" and not a new name
// (WCAG 2.1, success criterion 4.1.2).
test("says whether it is pressed, and a press changes that", async () => {
  const changes: boolean[] = [];
  const screen = await render(
    <Filter onPressed={(pressed) => changes.push(pressed)}>
      First option
    </Filter>,
  );
  const chip = screen.getByRole("button", { name: "First option" });
  await expect.element(chip).toHaveAttribute("aria-pressed", "false");

  await chip.click();
  await expect.element(chip).toHaveAttribute("aria-pressed", "true");

  await chip.click();
  await expect.element(chip).toHaveAttribute("aria-pressed", "false");
  expect(changes).toEqual([true, false]);
});

// The state is the caller's: a chip that kept one of its own would show a
// filter as on that the view has not applied.
test("shows the state it is given and none of its own", async () => {
  const change = vi.fn();
  const screen = await render(
    <Chip pressed={false} onPressedChange={change}>
      First option
    </Chip>,
  );
  const chip = screen.getByRole("button", { name: "First option" });

  await chip.click();

  expect(change).toHaveBeenCalledExactlyOnceWith(true);
  await expect.element(chip).toHaveAttribute("aria-pressed", "false");
});

test("is pressed by Enter and by Space", async () => {
  const screen = await render(<Filter>First option</Filter>);
  const chip = screen.getByRole("button", { name: "First option" });

  await userEvent.tab();
  await expect.element(chip).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(chip).toHaveAttribute("aria-pressed", "true");

  await userEvent.keyboard(" ");
  await expect.element(chip).toHaveAttribute("aria-pressed", "false");
});

// What a control shows is what it is called (WCAG 2.1, success criterion
// 2.5.3), with the space the eye sees between the label and the number.
test("names itself by its label and its count", async () => {
  const screen = await render(
    <>
      <Filter count={12}>First option</Filter>
      <Filter count={0}>Second option</Filter>
      <Filter>Third option</Filter>
    </>,
  );

  await expect
    .element(screen.getByRole("button", { name: "First option 12" }))
    .toBeVisible();
  // Nothing is a count too: a filter that matches nothing says so.
  await expect
    .element(screen.getByRole("button", { name: "Second option 0" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Third option", exact: true }))
    .toBeVisible();
});

// The handoff shows a pressed chip by its tint, which stands 1.2:1 against
// the surface around it. The border in the accent is the indicator that
// reaches 3:1 (WCAG 2.1, success criterion 1.4.11), and the tint lies over
// the opaque surface so that the text has one ground everywhere.
test.for(["light", "dark"] as const)(
  "has a border of its own when pressed, and its tint over the surface, in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Filter initially count={3}>
          First option
        </Filter>
        <Filter count={4}>Second option</Filter>
        <p>Somewhere else</p>
      </>,
    );
    // The tests of this file share one pointer, and a chip under it has
    // the fill of its hover.
    await screen.getByText("Somewhere else").hover();
    const style = (name: string) =>
      getComputedStyle(screen.getByRole("button", { name }).element());
    const pressed = style("First option 3");
    const released = style("Second option 4");
    const tint = colourOf("--ac-m");

    expect(pressed.borderTopColor).toBe(colourOf("--ac"));
    expect(released.borderTopColor).toBe(colourOf("--bd"));
    expect(pressed.borderTopColor).not.toBe(released.borderTopColor);
    expect(pressed.backgroundColor).toBe(colourOf("--bg-surface"));
    expect(pressed.backgroundImage.split(tint)).toHaveLength(3);
    expect(pressed.color).toBe(colourOf("--ac-t"));
    expect(released.backgroundColor).toBe(colourOf("--bg-surface"));
    expect(released.backgroundImage).toBe("none");
    expect(released.color).toBe(colourOf("--t2"));
  },
);

// On the fill of the pointer the text of a pressed chip would be at 4:1.
// The pressed look keeps the surface, whatever the pointer does.
test("keeps the surface under its tint while the pointer is over it", async () => {
  const screen = await render(
    <>
      <Filter initially>First option</Filter>
      <Filter>Second option</Filter>
    </>,
  );
  const pressed = screen.getByRole("button", { name: "First option" });
  const released = screen.getByRole("button", { name: "Second option" });

  await released.hover();
  await expect
    .poll(() => getComputedStyle(released.element()).backgroundColor)
    .toBe(colourOf("--bg-hover"));

  await pressed.hover();
  await expect
    .poll(() => getComputedStyle(released.element()).backgroundColor)
    .toBe(colourOf("--bg-surface"));
  const style = getComputedStyle(pressed.element());
  expect(style.backgroundColor).toBe(colourOf("--bg-surface"));
  expect(style.color).toBe(colourOf("--ac-t"));
});

// The handoff dims the count to three quarters, which is below 4.5:1 in
// the light theme. It has the colour of the label, undimmed.
test("shows its count in the colour of its label", async () => {
  const screen = await render(
    <>
      <Filter count={12}>First option</Filter>
      <p>Somewhere else</p>
    </>,
  );
  await screen.getByText("Somewhere else").hover();
  const count = screen.getByText("12").element();

  expect(getComputedStyle(count).color).toBe(colourOf("--t2"));
  expect(getComputedStyle(count).opacity).toBe("1");
});

test("does nothing while it is disabled", async () => {
  const change = vi.fn();
  const screen = await render(
    <Chip pressed={false} onPressedChange={change} disabled>
      First option
    </Chip>,
  );
  const chip = screen.getByRole("button", { name: "First option" });
  await expect.element(chip).toBeDisabled();
  expect(getComputedStyle(chip.element()).opacity).toBe("0.45");

  // Forced, because a disabled button is no target at all.
  await chip.click({ force: true });

  expect(change).not.toHaveBeenCalled();
});

// A contrast theme of the system removes the tint and paints every border
// in one colour: the pressed chip is then told from the others by the
// width of its border.
test("has a thicker border when pressed while the system forces its colours", async () => {
  const screen = await render(
    <>
      <Filter initially>First option</Filter>
      <Filter>Second option</Filter>
    </>,
  );
  const width = (name: string) =>
    getComputedStyle(screen.getByRole("button", { name }).element())
      .borderTopWidth;
  expect(width("First option")).toBe("1px");

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(width("First option")).toBe("2px");
  expect(width("Second option")).toBe("1px");
});
