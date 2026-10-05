// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import {
  ShortcutsProvider,
  storageKey as characterKeysKey,
} from "../shortcuts/ShortcutsProvider";
import { storageKey } from "./theme";
import { ThemeToggle } from "./ThemeToggle";

const page = document.documentElement;

/** The colour a token has on the page, written the way the browser reports it. */
function colourOf(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

beforeEach(() => {
  localStorage.clear();
  page.dataset.theme = "light";
});

// The toggle is the one way to change the theme, and the theme is the
// attribute the design tokens key on, so the attribute is what a click has
// to change. The pressed state is what a screen reader announces.
test("a click switches the page to the dark theme and back", async () => {
  const screen = await render(<ThemeToggle />);
  const toggle = screen.getByRole("button", { name: "Dark theme" });
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
  expect(page.dataset.theme).toBe("dark");

  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  expect(page.dataset.theme).toBe("light");
});

// A choice that held only until the next reload would have to be made
// again on every start of sdash.
test("the choice is kept for the next visit", async () => {
  const screen = await render(<ThemeToggle />);

  await screen.getByRole("button", { name: "Dark theme" }).click();

  expect(localStorage.getItem(storageKey)).toBe("dark");
});

// WCAG 2.1 asks that everything works from the keyboard (2.1.1) and that
// the focused element can be seen (2.4.7). The ring is the focus token of
// styles/tokens.css, not whatever the browser would draw.
test("the keyboard reaches the toggle, shows where it is, and works it", async () => {
  const screen = await render(<ThemeToggle />);
  const toggle = screen.getByRole("button", { name: "Dark theme" });

  await userEvent.tab();
  await expect.element(toggle).toHaveFocus();
  const style = getComputedStyle(toggle.element());
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("2px");
  expect(style.outlineColor).toBe(colourOf("--focus"));

  await userEvent.keyboard("{Enter}");
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
  expect(page.dataset.theme).toBe("dark");

  await userEvent.keyboard(" ");
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  expect(page.dataset.theme).toBe("light");
});

/** The hint of the toggle: its name and its key, beside the button. */
function hintOf(toggle: Element): HTMLElement | null {
  return toggle.querySelector<HTMLElement>(":scope > span[aria-hidden='true']");
}

// The toggle shows an icon and no text. A sighted user gets its name on
// keyboard focus and under the pointer, as for an item of the rail, and
// the key that does the same beside it. It stays while the focus does and
// goes on Escape (WCAG 2.1, success criterion 1.4.13).
test("shows its name and its key on keyboard focus, until Escape", async () => {
  const screen = await render(
    <>
      <ThemeToggle />
      <p>Somewhere else</p>
    </>,
  );
  const toggle = screen.getByRole("button", { name: "Dark theme" });
  const hint = () => hintOf(toggle.element());
  // The tests of this file share one pointer, and the one before left it
  // where the toggle is.
  await screen.getByText("Somewhere else").hover();
  await expect.poll(() => hint()?.hidden).toBe(true);

  await userEvent.tab();
  await expect.element(toggle).toHaveFocus();

  await expect.poll(() => hint()?.hidden).toBe(false);
  // What the hint says is what the button is called: someone who speaks
  // to the computer says what they see (success criterion 2.5.3).
  expect(hint()?.querySelector("kbd")?.textContent).toBe("t");
  expect(hint()?.textContent).toBe("Dark themet");
  await expect.element(toggle).toHaveAccessibleName("Dark theme");
  const label = hint()?.querySelector<HTMLElement>(":scope > span") ?? null;
  await expect.element(label).toBeInViewport({ ratio: 1 });
  // Below the button, where the header has nothing.
  expect(label?.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    toggle.element().getBoundingClientRect().bottom,
  );

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => hint()?.hidden).toBe(true);
  await expect.element(toggle).toHaveFocus();
});

test("shows its name under the pointer, and no longer when the pointer has left", async () => {
  const screen = await render(
    <>
      <ThemeToggle />
      <p>Somewhere else</p>
    </>,
  );
  const toggle = screen.getByRole("button", { name: "Dark theme" });
  const elsewhere = screen.getByText("Somewhere else");
  // From somewhere else, wherever the test before left the pointer.
  await elsewhere.hover();
  await expect.poll(() => hintOf(toggle.element())?.hidden).toBe(true);

  await toggle.hover();
  await expect.poll(() => hintOf(toggle.element())?.hidden).toBe(false);

  await elsewhere.hover();
  await expect.poll(() => hintOf(toggle.element())?.hidden).toBe(true);
});

// The search button and the button that collapses the sidebar tell
// assistive technology their keys, and so does this one.
test("tells assistive technology its key", async () => {
  const screen = await render(<ThemeToggle />);

  await expect
    .element(screen.getByRole("button", { name: "Dark theme" }))
    .toHaveAttribute("aria-keyshortcuts", "T");
});

// With the single-key shortcuts switched off the key does nothing, and
// the button must not name it, to the eye or to assistive technology.
test("names no key while the single-key shortcuts are switched off", async () => {
  localStorage.setItem(characterKeysKey, "off");
  const screen = await render(
    <ShortcutsProvider platform="Linux">
      <ThemeToggle />
    </ShortcutsProvider>,
  );
  const toggle = screen.getByRole("button", { name: "Dark theme" });

  await userEvent.tab();
  await expect.element(toggle).toHaveFocus();

  await expect.poll(() => hintOf(toggle.element())?.hidden).toBe(false);
  expect(hintOf(toggle.element())?.textContent).toBe("Dark theme");
  await expect.element(toggle).not.toHaveAttribute("aria-keyshortcuts");
});
