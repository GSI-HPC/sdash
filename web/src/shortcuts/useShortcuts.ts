// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useContext, useEffect, useRef, useSyncExternalStore } from "react";

import { RegistryContext, ScopeContext, SettingsContext } from "./context";
import { ariaKeyShortcuts, isCharacterKey, parseBinding } from "./keys";
import type { Listed, Registry } from "./registry";

/** A keyboard shortcut as a component registers it. */
export interface Shortcut {
  /**
   * The keys, as keys.ts reads them: "t", "g o", "mod+k". They are unique
   * among the shortcuts of one call.
   */
  readonly keys: string;
  /** What the shortcut does, in words for the user; the help shows it. */
  readonly description: string;
  /** The heading the help lists the shortcut under. */
  readonly group: string;
  /**
   * What the shortcut does. Null for a key that something else acts on and
   * the help still has to list, as the dialogs do with Escape.
   */
  readonly run: (() => void) | null;
  /** False takes the shortcut out for as long as it cannot apply. */
  readonly enabled?: boolean;
}

function useRegistry(): Registry {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error("a shortcut is used outside a ShortcutsProvider");
  }
  return registry;
}

/** What of a shortcut the registry is told, and the help shows. */
type Described = Pick<Shortcut, "keys" | "description" | "group"> & {
  listedOnly: boolean;
};

/**
 * Registers the shortcuts of a component for as long as it is mounted, in
 * the scope the component is rendered in. This is the one way a shortcut
 * comes to exist: nothing else listens to the keyboard for one, so that
 * every shortcut is in the help and obeys the same rules
 * (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
 *
 * The functions may be new on every render. Only a change in what the help
 * shows, the keys, the texts or which shortcuts are enabled, registers
 * anew.
 */
export function useShortcuts(shortcuts: readonly Shortcut[]): void {
  const registry = useRegistry();
  const scope = useContext(ScopeContext);

  const enabled = shortcuts.filter((shortcut) => shortcut.enabled !== false);
  const latest = useRef(new Map<string, Shortcut["run"]>());
  useEffect(() => {
    latest.current = new Map(enabled.map(({ keys, run }) => [keys, run]));
  });

  // The description as text, so that the effect below depends on what the
  // list says and not on the array, which is a new one each render.
  const described = JSON.stringify(
    enabled.map(({ keys, description, group, run }): Described => ({
      keys,
      description,
      group,
      listedOnly: run === null,
    })),
  );

  useEffect(() => {
    const removals = (JSON.parse(described) as Described[]).map(
      ({ keys, description, group, listedOnly }) =>
        registry.register({
          keys,
          binding: parseBinding(keys),
          scope,
          description,
          group,
          run: listedOnly
            ? null
            : () => {
                latest.current.get(keys)?.();
              },
        }),
    );
    return () => {
      removals.forEach((remove) => {
        remove();
      });
    };
  }, [registry, scope, described]);
}

/**
 * Tells the registry that an overlay is open over the page, for as long
 * as `open` is true: the shortcuts of the page then rest (resolve.ts).
 * Every primitive that takes the focus while it is open calls it, the
 * dialog, the drawer, the popover, the menu and the select, and nothing
 * else does.
 *
 * It goes by the overlay's open state and not by whether its content is
 * mounted. A dialog library keeps the content mounted while it leaves, for
 * as long as its exit animation takes, and a key pressed right after
 * Escape, "g" and "j", say, would be lost for that long.
 *
 * Without a registry it does nothing, so that a dialog renders by itself
 * in a test.
 */
export function useOverlayOpen(open: boolean): void {
  const registry = useContext(RegistryContext);

  useEffect(
    () => (open ? registry?.openOverlay() : undefined),
    [registry, open],
  );
}

/** Every shortcut registered now, for the help to list. */
export function useRegisteredShortcuts(): readonly Listed[] {
  const registry = useRegistry();
  return useSyncExternalStore(registry.subscribe, registry.listed);
}

/**
 * Whether a shortcut works at the moment: one typed with character keys
 * alone does not while the user has those switched off. A control that
 * shows its shortcut asks, so that it never names keys that do nothing.
 */
export function useShortcutWorks(keys: string): boolean {
  const { characterKeys } = useContext(SettingsContext);
  return characterKeys || !isCharacterKey(parseBinding(keys));
}

/**
 * The value of aria-keyshortcuts for a control with the given shortcut:
 * undefined, which leaves the attribute out, while the shortcut does not
 * work.
 */
export function useAriaKeyShortcuts(keys: string): string | undefined {
  const { apple } = useContext(SettingsContext);
  const works = useShortcutWorks(keys);
  return works ? ariaKeyShortcuts(parseBinding(keys), apple) : undefined;
}
