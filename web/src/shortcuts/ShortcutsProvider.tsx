// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { readStored, store } from "../storage/local";
import { RegistryContext, SettingsContext } from "./context";
import { isApplePlatform } from "./keys";
import { createRegistry } from "./registry";

/** The localStorage key the user's choice is kept under. */
export const storageKey = "sdash.shortcuts.character-keys";

const off = "off";
const on = "on";

/**
 * Holds the registry of keyboard shortcuts for everything inside it and
 * listens to the keyboard on its behalf. The application has one, around
 * the shell (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
 *
 * It also holds the user's choice to have character-key shortcuts on or
 * off (WCAG 2.1, success criterion 2.1.4), which is on unless they
 * switched it off.
 *
 * `platform` is for tests; the application reads the browser's.
 */
export function ShortcutsProvider({
  platform,
  children,
}: {
  platform?: string;
  children: ReactNode;
}) {
  // navigator.platform is marked as deprecated and is still the one value
  // every supported browser has for this; its successor exists in Chromium
  // alone. It is read once: a keyboard does not change under a page.
  const [apple] = useState(() =>
    isApplePlatform(platform ?? navigator.platform),
  );
  const [characterKeys, setCharacterKeys] = useState(
    () => readStored(storageKey) !== off,
  );
  const [registry] = useState(() => {
    const created = createRegistry(apple);
    created.setCharacterKeys(characterKeys);
    return created;
  });

  useEffect(() => {
    // On the window, after every handler of the page has had the event: a
    // component that acts on a key itself calls preventDefault, and the
    // registry then leaves that key alone.
    function onKeyDown(event: KeyboardEvent) {
      registry.handle(event);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [registry]);

  const settings = useMemo(
    () => ({
      apple,
      characterKeys,
      setCharacterKeys(next: boolean) {
        registry.setCharacterKeys(next);
        store(storageKey, next ? on : off);
        setCharacterKeys(next);
      },
    }),
    [apple, characterKeys, registry],
  );

  return (
    <RegistryContext value={registry}>
      <SettingsContext value={settings}>{children}</SettingsContext>
    </RegistryContext>
  );
}
