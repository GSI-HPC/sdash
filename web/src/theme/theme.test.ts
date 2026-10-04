// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { otherTheme, resolveTheme, themes } from "./theme";

describe("the theme of a page that is starting", () => {
  // A user who chose a theme keeps it, whatever the system says: the choice
  // is the more specific wish.
  test.each([
    { stored: "light", prefersDark: true, theme: "light" },
    { stored: "dark", prefersDark: false, theme: "dark" },
  ])(
    "is the stored choice $stored when the system prefers dark: $prefersDark",
    ({ stored, prefersDark, theme }) => {
      expect(resolveTheme(stored, prefersDark)).toBe(theme);
    },
  );

  // Without a choice the page looks like the rest of the user's desktop.
  test.each([
    { prefersDark: true, theme: "dark" },
    { prefersDark: false, theme: "light" },
  ])(
    "follows the system without a stored choice (prefers dark: $prefersDark)",
    ({ prefersDark, theme }) => {
      expect(resolveTheme(null, prefersDark)).toBe(theme);
    },
  );

  // The store is shared with whatever else runs on the same origin and
  // outlives a version of sdash, so its content is not trusted to be a
  // theme. A value that is none must not reach the data-theme attribute,
  // where no token would match it.
  test.each(["", "DARK", "blue", "null", "light "])(
    "treats the stored value %j as no choice",
    (stored) => {
      expect(resolveTheme(stored, true)).toBe("dark");
      expect(resolveTheme(stored, false)).toBe("light");
    },
  );
});

describe("the toggle", () => {
  // Two presses must lead back, or a user could not undo a press.
  test.each(themes)("leads from %s to the other theme and back", (theme) => {
    expect(otherTheme(theme)).not.toBe(theme);
    expect(otherTheme(otherTheme(theme))).toBe(theme);
  });
});
