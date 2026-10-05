// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import {
  ShortcutsProvider,
  storageKey as characterKeysKey,
} from "../shortcuts/ShortcutsProvider";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { IconButton, type IconButtonProps } from "./IconButton";

const root = document.documentElement;

/**
 * An icon button with room around it, so that its tooltip has a place, and
 * a text beside it for the pointer to rest on: the tests of a file share
 * one pointer, which the test before may have left on a control.
 */
function Page(props: Partial<IconButtonProps>) {
  return (
    <>
      <div className="m-24 flex gap-2">
        <IconButton icon="search" label="Example search" {...props} />
        <button type="button">Another control</button>
      </div>
      <p>Somewhere else</p>
    </>
  );
}

/** Renders the page and takes the pointer off every control. */
async function renderAway(props: Partial<IconButtonProps> = {}) {
  const screen = await render(<Page {...props} />);
  await screen.getByText("Somewhere else").hover();
  await expect.poll(shownTooltips).toEqual([]);
  return screen;
}

beforeEach(() => {
  root.dataset.theme = "light";
  localStorage.clear();
});

afterEach(async () => {
  await forceColours(false);
});

// A button that shows an icon has no text to be named by. Its label is
// its name, and the tooltip shows the same words to whoever sees the
// button, so that someone who speaks to the computer can say what they
// read (WCAG 2.1, success criteria 4.1.2 and 2.5.3).
test("is named by its label, which is also what its tooltip says", async () => {
  const press = vi.fn();
  const screen = await renderAway({ onClick: press });
  const button = screen.getByRole("button", { name: "Example search" });
  await expect.element(button).toHaveAttribute("type", "button");
  // The icon is decoration and is all the button holds.
  const icon = button.element().querySelector("svg");
  expect(icon?.getAttribute("aria-hidden")).toBe("true");
  expect(button.element().textContent).toBe("");

  await button.hover();
  await expect.poll(shownTooltips).toEqual(["Example search"]);
  // The tooltip repeats the name and adds nothing for assistive
  // technology to read twice.
  const [tooltip] = shownTooltipElements();
  expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  await expect.element(button).not.toHaveAttribute("aria-describedby");

  await button.click();
  expect(press).toHaveBeenCalledTimes(1);
});

test("shows its label and its key on keyboard focus", async () => {
  const press = vi.fn();
  const screen = await renderAway({ keys: "t", onClick: press });
  const button = screen.getByRole("button", { name: "Example search" });

  await userEvent.tab();
  await expect.element(button).toHaveFocus();

  await expect.poll(shownTooltips).toEqual(["Example searcht"]);
  const [tooltip] = shownTooltipElements();
  expect(tooltip?.querySelector("kbd")?.textContent).toBe("t");
  // The key cap is no part of the name.
  await expect.element(button).toHaveAccessibleName("Example search");
  // Below the button, unless it is told another side.
  expect(tooltip?.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    button.element().getBoundingClientRect().bottom,
  );

  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard(" ");
  expect(press).toHaveBeenCalledTimes(2);
});

test("shows its tooltip on the side it is told", async () => {
  const screen = await renderAway({ tooltipSide: "right" });
  const button = screen.getByRole("button", { name: "Example search" });

  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Example search"]);

  const [tooltip] = shownTooltipElements();
  expect(tooltip?.getBoundingClientRect().left).toBeGreaterThanOrEqual(
    button.element().getBoundingClientRect().right,
  );
});

// A toggle keeps its name and says its state, so that a screen reader
// announces "pressed" and not another name. Without `pressed` the button
// is no toggle and says nothing about a state.
test("says whether it is pressed", async () => {
  function Toggle() {
    const [pressed, setPressed] = useState(false);
    return (
      <IconButton
        icon="sidebarCollapse"
        label="Example panel"
        pressed={pressed}
        onClick={() => {
          setPressed(!pressed);
        }}
      />
    );
  }
  const screen = await render(
    <>
      <Toggle />
      <IconButton icon="search" label="Example search" />
    </>,
  );
  const toggle = screen.getByRole("button", { name: "Example panel" });
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await expect
    .element(screen.getByRole("button", { name: "Example search" }))
    .not.toHaveAttribute("aria-pressed");
});

// A control that has a shortcut tells assistive technology of it, and
// names no key that does nothing: with the single-key shortcuts switched
// off, neither the attribute nor the key cap is there.
test("tells assistive technology its key, and not while the single-key shortcuts are off", async () => {
  const page = (
    <ShortcutsProvider platform="Linux">
      <div className="m-24">
        <IconButton icon="search" label="Example search" keys="t" />
        <IconButton icon="sun" label="Example palette" keys="mod+k" />
        <IconButton icon="moon" label="Example plain" />
      </div>
    </ShortcutsProvider>
  );
  const screen = await render(page);
  const button = (name: string) => screen.getByRole("button", { name });

  await expect
    .element(button("Example search"))
    .toHaveAttribute("aria-keyshortcuts", "T");
  await expect
    .element(button("Example palette"))
    .toHaveAttribute("aria-keyshortcuts", "Control+K");
  await expect
    .element(button("Example plain"))
    .not.toHaveAttribute("aria-keyshortcuts");

  await screen.unmount();
  localStorage.setItem(characterKeysKey, "off");
  const again = await render(page);
  const search = again.getByRole("button", { name: "Example search" });

  await expect.element(search).not.toHaveAttribute("aria-keyshortcuts");
  // A shortcut with the modifier is no single-key shortcut and stays.
  await expect
    .element(again.getByRole("button", { name: "Example palette" }))
    .toHaveAttribute("aria-keyshortcuts", "Control+K");
  await userEvent.tab();
  await expect.element(search).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Example search"]);
});

// The handoff draws a pressed button's icon in white on --ac, which is
// below the 3:1 of an icon in the dark theme. The pair used in its place
// is the one of the primary button, and styles/pairs.test.ts holds it to
// its ratio; this test ties the button to the pair.
test.for(["light", "dark"] as const)(
  "fills a pressed button with the accent and draws its icon in the surface colour in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <IconButton icon="search" label="Pressed" pressed />
        <IconButton icon="search" label="Released" pressed={false} />
        <IconButton icon="search" label="Ghost" variant="ghost" />
        <p>Somewhere else</p>
      </>,
    );
    // The tests of this file share one pointer, and a button under it has
    // the fill of its hover.
    await screen.getByText("Somewhere else").hover();
    const style = (name: string) =>
      getComputedStyle(screen.getByRole("button", { name }).element());

    expect(style("Pressed").backgroundColor).toBe(colourOf("--ac-l"));
    expect(style("Pressed").color).toBe(colourOf("--bg-surface"));
    expect(style("Released").backgroundColor).toBe(colourOf("--bg-surface"));
    expect(style("Released").color).toBe(colourOf("--t2"));
    expect(style("Released").borderTopColor).toBe(colourOf("--bd"));
    expect(style("Ghost").backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style("Ghost").borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(style("Ghost").color).toBe(colourOf("--t2"));
    // The icon is drawn in the colour of the button's text.
    const icon = screen
      .getByRole("button", { name: "Pressed" })
      .element()
      .querySelector("svg");
    expect(icon && getComputedStyle(icon).stroke).toBe(
      colourOf("--bg-surface"),
    );
  },
);

// The pressed look holds under the pointer: the fill of the hover must not
// take its place, or the state would go when the pointer comes.
test("keeps its pressed look while the pointer is over it", async () => {
  const screen = await render(
    <>
      <IconButton icon="search" label="Pressed" pressed />
      <IconButton icon="search" label="Released" />
    </>,
  );
  const pressed = screen.getByRole("button", { name: "Pressed" });
  const released = screen.getByRole("button", { name: "Released" });

  await released.hover();
  await expect
    .poll(() => getComputedStyle(released.element()).backgroundColor)
    .toBe(colourOf("--bg-hover"));
  await pressed.hover();
  await expect
    .poll(() => getComputedStyle(released.element()).backgroundColor)
    .toBe(colourOf("--bg-surface"));

  expect(getComputedStyle(pressed.element()).backgroundColor).toBe(
    colourOf("--ac-l"),
  );
  expect(getComputedStyle(pressed.element()).color).toBe(
    colourOf("--bg-surface"),
  );
});

// The squares of the scale: as high as a button of the same size, and as
// wide as high.
test("is a square of the height its size says", async () => {
  const screen = await render(
    <>
      <IconButton icon="search" label="Extra small" size="xs" />
      <IconButton icon="search" label="Small" size="sm" />
      <IconButton icon="search" label="Medium" />
      <IconButton icon="search" label="Large" size="lg" />
    </>,
  );
  const box = (name: string) => {
    const { width, height } = screen
      .getByRole("button", { name })
      .element()
      .getBoundingClientRect();
    return [width, height];
  };

  expect(box("Extra small")).toEqual([24, 24]);
  expect(box("Small")).toEqual([28, 28]);
  expect(box("Medium")).toEqual([32, 32]);
  expect(box("Large")).toEqual([36, 36]);
});

// A drawer, a popover and a menu hand the button they are given a ref and
// the attributes of a trigger. They have to arrive at the element through
// the tooltip that is around it.
test("forwards its ref and its native attributes to the button element", async () => {
  let element: HTMLElement | null = null;
  const screen = await render(
    <IconButton
      ref={(node) => {
        element = node;
      }}
      icon="search"
      label="Example search"
      keys="t"
      id="example-search"
      aria-haspopup="dialog"
      aria-expanded={false}
      className="ml-2"
    />,
  );
  const button = screen.getByRole("button", { name: "Example search" });

  expect(element).toBe(button.element());
  await expect.element(button).toHaveAttribute("id", "example-search");
  await expect.element(button).toHaveAttribute("aria-haspopup", "dialog");
  await expect.element(button).toHaveAttribute("aria-expanded", "false");
  await expect.element(button).toHaveClass("ml-2", "inline-flex");
});

// Disabled with nothing to say, it is out of the way. Disabled and still
// in the order of the Tab key, it says what it is called and that it is
// disabled, and a press does nothing.
test("does nothing while disabled, and still shows its name where it keeps the focus", async () => {
  const press = vi.fn();
  const screen = await render(
    <>
      <div className="m-24 flex gap-2">
        <IconButton icon="search" label="Gone" disabled onClick={press} />
        <IconButton
          icon="search"
          label="Kept"
          disabled
          focusableWhenDisabled
          onClick={press}
        />
      </div>
      <p>Somewhere else</p>
    </>,
  );
  await screen.getByText("Somewhere else").hover();
  const gone = screen.getByRole("button", { name: "Gone" });
  const kept = screen.getByRole("button", { name: "Kept" });
  await expect.element(gone).toBeDisabled();
  await expect.element(kept).toHaveAttribute("aria-disabled", "true");
  // The icon is dimmed and the button is not: opacity on the button would
  // dim the ring of its focus with it, to 1.9:1 in the light theme.
  const icon = (button: Element) => button.querySelector("svg") ?? button;
  expect(getComputedStyle(icon(gone.element())).opacity).toBe("0.45");
  expect(getComputedStyle(icon(kept.element())).opacity).toBe("0.45");
  expect(getComputedStyle(kept.element()).opacity).toBe("1");
  expect(getComputedStyle(kept.element()).cursor).toBe("not-allowed");

  await userEvent.tab();
  await expect.element(kept).toHaveFocus();
  expect(getComputedStyle(kept.element()).outlineColor).toBe(
    colourOf("--focus"),
  );
  await expect.poll(shownTooltips).toEqual(["Kept"]);
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard(" ");
  await kept.click({ force: true });
  await gone.click({ force: true });

  expect(press).not.toHaveBeenCalled();
});

// A disabled toggle still says whether it is pressed, to the eye as to
// assistive technology, and neither kind answers the pointer.
test("keeps its pressed look, faded, and does not answer the pointer while it is disabled", async () => {
  const screen = await render(
    <>
      <IconButton
        icon="search"
        label="Pressed"
        pressed
        disabled
        focusableWhenDisabled
      />
      <IconButton
        icon="search"
        label="Released"
        disabled
        focusableWhenDisabled
      />
      <IconButton
        icon="search"
        label="Ghost"
        variant="ghost"
        disabled
        focusableWhenDisabled
      />
      <IconButton icon="search" label="Working" />
    </>,
  );
  const button = (name: string) => screen.getByRole("button", { name });
  const style = (name: string) => getComputedStyle(button(name).element());

  await button("Working").hover();
  await expect
    .poll(() => style("Working").backgroundColor)
    .toBe(colourOf("--bg-hover"));
  await button("Released").hover({ force: true });
  await expect
    .poll(() => style("Working").backgroundColor)
    .toBe(colourOf("--bg-surface"));
  expect(style("Released").backgroundColor).toBe(colourOf("--bg-surface"));
  expect(style("Released").color).toBe(colourOf("--t2"));

  await button("Ghost").hover({ force: true });
  expect(style("Ghost").backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(style("Ghost").color).toBe(colourOf("--t2"));

  await expect.element(button("Pressed")).toHaveAttribute("aria-pressed");
  // The accent, let through by the measure the icon is dimmed by.
  expect(style("Pressed").backgroundColor).toContain("0.45");
  expect(style("Pressed").color).toBe(colourOf("--bg-surface"));
  expect(style("Pressed").opacity).toBe("1");
});

// A contrast theme of the system removes the fill that shows a pressed
// button and paints every border in one colour: the pressed button is
// then told from the others by the width of its border.
test("has a thicker border when pressed while the system forces its colours", async () => {
  const screen = await render(
    <>
      <IconButton icon="search" label="Pressed" pressed />
      <IconButton icon="search" label="Released" pressed={false} />
      <IconButton icon="search" label="Ghost" variant="ghost" />
    </>,
  );
  const style = (name: string) =>
    getComputedStyle(screen.getByRole("button", { name }).element());
  expect(style("Pressed").borderTopWidth).toBe("1px");

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(style("Pressed").borderTopWidth).toBe("2px");
  expect(style("Released").borderTopWidth).toBe("1px");
  // The button without a border of its own has a boundary there too.
  expect(style("Ghost").borderTopWidth).toBe("1px");
  expect(style("Ghost").borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
});
