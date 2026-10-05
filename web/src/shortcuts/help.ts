// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { Listed } from "./registry";

/** The shortcuts the help shows under one heading. */
export interface HelpGroup {
  readonly group: string;
  readonly shortcuts: readonly Listed[];
}

/**
 * Arranges the registered shortcuts for the help: under their headings, in
 * the order the headings and the shortcuts were first registered. Two
 * components that register the same keys for the same thing, as two
 * instances of one component do, are listed once.
 */
export function helpGroups(listed: readonly Listed[]): HelpGroup[] {
  const groups = new Map<string, Listed[]>();
  for (const shortcut of listed) {
    const shortcuts = groups.get(shortcut.group) ?? [];
    const twice = shortcuts.some(
      (other) =>
        other.keys === shortcut.keys &&
        other.description === shortcut.description,
    );
    if (!twice) {
      shortcuts.push(shortcut);
    }
    groups.set(shortcut.group, shortcuts);
  }
  return [...groups].map(([group, shortcuts]) => ({ group, shortcuts }));
}
