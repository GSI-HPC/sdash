// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the sidebar's state is called where it is kept. The state itself
// lives in the shell (Shell.tsx).

/** The localStorage key the user's choice is kept under. */
export const storageKey = "sdash.sidebar";

/** What is stored under it. */
export const stored = { collapsed: "collapsed", expanded: "expanded" } as const;

/**
 * Whether a page that is starting shows the sidebar collapsed. Anything in
 * the store but the word for it counts as no choice, and the sidebar then
 * starts as the design draws it, expanded.
 */
export function startsCollapsed(value: string | null): boolean {
  return value === stored.collapsed;
}

/**
 * The media query of a screen too narrow for the full sidebar beside the
 * content: below it the sidebar is the rail whatever the user chose. The
 * width is where Tailwind's "md" starts, so "max-md:" in a class name
 * means the same screens.
 */
export const narrowScreen = "(width < 48rem)";
