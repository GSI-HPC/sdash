// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";

import { currentTheme, type Theme } from "./theme";

/**
 * Calls back whenever the theme of the page changes. The theme is the
 * data-theme attribute of the html element and nothing else, so the
 * attribute is what is watched: the toggle in the header, the "t" key and
 * the command palette all change it, and none of them has to tell the
 * others.
 */
function subscribe(changed: () => void): () => void {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    observer.disconnect();
  };
}

/** The theme the page shows, kept up to date whoever changes it. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme);
}
