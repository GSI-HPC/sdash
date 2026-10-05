// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the component tests of the shortcut registry share: a component
// that registers shortcuts as any component would, and shortcuts that
// write down that they ran. Only tests import it.

import type { ReactNode } from "react";
import { render } from "vitest-browser-react";

import { ShortcutsProvider } from "../shortcuts/ShortcutsProvider";
import { type Shortcut, useShortcuts } from "../shortcuts/useShortcuts";

/** What the shortcuts of a test did, in the order they ran. */
export type Log = string[];

/** A shortcut that writes its name into the log when it runs. */
export function logging(log: Log, keys: string, name: string): Shortcut {
  return {
    keys,
    description: name,
    group: "Test",
    run: () => log.push(name),
  };
}

/** A component that registers shortcuts, as any component would. */
export function Registers({
  shortcuts,
  children,
}: {
  shortcuts: readonly Shortcut[];
  children?: ReactNode;
}) {
  useShortcuts(shortcuts);
  return children;
}

/** Renders the tree inside a provider that reads Control as the modifier. */
export function renderWithShortcuts(tree: ReactNode) {
  return render(<ShortcutsProvider platform="Linux">{tree}</ShortcutsProvider>);
}
