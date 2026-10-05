// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The light and dark theme: which one applies, where the choice is kept and
// how it reaches the page. The theme is the data-theme attribute of the html
// element, which the design tokens in styles/tokens.css key on.

import { readStored, store } from "../storage/local";

/** The themes the design has tokens for. */
export const themes = ["light", "dark"] as const;

/** One of the two themes. */
export type Theme = (typeof themes)[number];

/** The localStorage key the user's choice is kept under. */
export const storageKey = "sdash.theme";

function isTheme(value: unknown): value is Theme {
  return themes.some((theme) => theme === value);
}

/**
 * Decides the theme of a page that is starting: the user's stored choice if
 * there is a valid one, otherwise what the system prefers. Anything else in
 * the store counts as no choice, since other code on the same origin, or a
 * later version with more themes, may have written it.
 */
export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (isTheme(stored)) {
    return stored;
  }
  return prefersDark ? "dark" : "light";
}

/** The theme the toggle switches to from the given one. */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/** Reads the stored choice; storage/local.ts says what a refusal means. */
export function readStoredTheme(): string | null {
  return readStored(storageKey);
}

/** Keeps the choice for the next visit. */
export function storeTheme(theme: Theme): void {
  store(storageKey, theme);
}

/** The theme the page shows now. */
export function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  return isTheme(applied) ? applied : "light";
}

/** Shows the page in the given theme. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Switches the page to the other theme and keeps the choice. */
export function toggleTheme(): Theme {
  const next = otherTheme(currentTheme());
  applyTheme(next);
  storeTheme(next);
  return next;
}

/** Works out the theme of a page that is starting and applies it. */
export function applyInitialTheme(): Theme {
  const theme = resolveTheme(
    readStoredTheme(),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  applyTheme(theme);
  return theme;
}
