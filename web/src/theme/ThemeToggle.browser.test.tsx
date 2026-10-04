// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
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
