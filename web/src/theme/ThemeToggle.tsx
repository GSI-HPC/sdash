// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { applyTheme, currentTheme, otherTheme, storeTheme } from "./theme";

/**
 * The button in the header that switches between the light and the dark
 * theme and keeps the choice.
 *
 * To assistive technology it is a toggle named "Dark theme" that is pressed
 * or not: the name stays the same and the state is announced when it
 * changes. The icon is decoration and shows, as in the design, the theme a
 * click leads to.
 */
export function ThemeToggle() {
  // The page's theme is set before the first render (theme/apply.ts), so the
  // attribute is the truth to start from.
  const [theme, setTheme] = useState(currentTheme);
  const dark = theme === "dark";

  function toggle() {
    const next = otherTheme(theme);
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      aria-label="Dark theme"
      aria-pressed={dark}
      onClick={toggle}
      className="grid size-8 cursor-pointer place-items-center rounded-md border border-bd bg-surface text-t2 hover:bg-hover hover:text-t1"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4 fill-none stroke-current stroke-[1.8]"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}
