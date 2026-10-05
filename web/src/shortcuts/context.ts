// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { createContext } from "react";

import type { Registry } from "./registry";
import type { Scope } from "./resolve";

/** The registry of the application; null outside a ShortcutsProvider. */
export const RegistryContext = createContext<Registry | null>(null);

/**
 * The scope a component's shortcuts are registered in. It follows from
 * where the component is rendered and is not something a component says
 * about itself: inside a view it is "view", inside a dialog "overlay", and
 * everywhere else "global" (ShortcutScope.tsx).
 */
export const ScopeContext = createContext<Scope>("global");

/** What the interface knows about the user's keyboard and their choice. */
export interface ShortcutSettings {
  /** Whether the modifier of shortcuts is Command and not Control. */
  readonly apple: boolean;
  /** Whether character-key shortcuts are switched on. */
  readonly characterKeys: boolean;
  /** Switches them on or off and keeps the choice. */
  readonly setCharacterKeys: (on: boolean) => void;
}

/**
 * The settings. Outside a provider they are the defaults, so that a
 * component which only shows a shortcut renders by itself in a test.
 */
export const SettingsContext = createContext<ShortcutSettings>({
  apple: false,
  characterKeys: true,
  setCharacterKeys: () => undefined,
});
