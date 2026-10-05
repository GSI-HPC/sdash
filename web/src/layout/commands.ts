// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the shell lets the user do from anywhere, said twice from one
// description: as keyboard shortcuts and as entries of the command
// palette. Going to a view is worked out from the view table, so a new
// view gets its shortcut and its entry without a line here
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
//
// Both functions are given the state and the actions and touch nothing
// themselves, so what they return is tested without a page.

import type { PaletteItem } from "../palette/items";
import { type View, views } from "../routing/views";
import type { Shortcut } from "../shortcuts/useShortcuts";
import type { Theme } from "../theme/theme";
import { goKeys, shellKeys } from "./keys";

/** What the shell's commands depend on. */
export interface ShellState {
  readonly theme: Theme;
  /** Whether the sidebar shows as the rail. */
  readonly rail: boolean;
  /** Whether the user can switch between the rail and the full sidebar. */
  readonly sidebarSwitchable: boolean;
  /** Whether character-key shortcuts are switched on. */
  readonly characterKeys: boolean;
}

/** What the shell's commands do. */
export interface ShellActions {
  readonly goTo: (view: View) => void;
  readonly togglePalette: () => void;
  readonly showHelp: () => void;
  readonly toggleTheme: () => void;
  readonly toggleSidebar: () => void;
  readonly setCharacterKeys: (on: boolean) => void;
}

/** The headings the help lists the shell's shortcuts under. */
export const shortcutGroups = { general: "General", goTo: "Go to" } as const;

/** The shell's shortcuts, the ones the design handoff names. */
export function shellShortcuts(
  state: ShellState,
  actions: ShellActions,
): Shortcut[] {
  const { general, goTo } = shortcutGroups;
  return [
    {
      keys: shellKeys.palette,
      description: "Open the command palette",
      group: general,
      run: actions.togglePalette,
    },
    {
      keys: shellKeys.help,
      description: "Show the keyboard shortcuts",
      group: general,
      run: actions.showHelp,
    },
    {
      keys: shellKeys.theme,
      description: "Switch the theme",
      group: general,
      run: actions.toggleTheme,
    },
    {
      keys: shellKeys.sidebar,
      description: "Collapse or expand the sidebar",
      group: general,
      run: actions.toggleSidebar,
      enabled: state.sidebarSwitchable,
    },
    {
      // The dialog acts on Escape itself (overlay/Modal.tsx). It is here
      // for the help to list.
      keys: shellKeys.close,
      description: "Close the open dialog",
      group: general,
      run: null,
    },
    ...views.map((view) => ({
      keys: goKeys(view),
      description: view.title,
      group: goTo,
      run: () => {
        actions.goTo(view);
      },
    })),
  ];
}

/**
 * The entries of the command palette: every view, then the shell's
 * actions. The label of an action says what choosing it does now, "Switch
 * to the dark theme" in the light one, and the keywords find it under the
 * name of the thing it changes.
 */
export function shellPaletteItems(
  state: ShellState,
  actions: ShellActions,
): PaletteItem[] {
  const toViews: PaletteItem[] = views.map((view) => ({
    id: `view-${view.id}`,
    kind: "view",
    label: view.title,
    keywords: view.keywords,
    keys: goKeys(view),
    run: () => {
      actions.goTo(view);
    },
  }));

  const theme: PaletteItem = {
    id: "action-theme",
    kind: "action",
    label:
      state.theme === "dark"
        ? "Switch to the light theme"
        : "Switch to the dark theme",
    keywords: ["toggle theme", "appearance", "colours", "dark", "light"],
    keys: shellKeys.theme,
    run: actions.toggleTheme,
  };
  const sidebar: PaletteItem = {
    id: "action-sidebar",
    kind: "action",
    label: state.rail ? "Expand the sidebar" : "Collapse the sidebar",
    keywords: ["toggle sidebar", "navigation", "rail", "menu"],
    keys: shellKeys.sidebar,
    run: actions.toggleSidebar,
  };
  const help: PaletteItem = {
    id: "action-help",
    kind: "action",
    label: "Show the keyboard shortcuts",
    keywords: ["help", "keys", "hotkeys"],
    keys: shellKeys.help,
    run: actions.showHelp,
  };
  const characterKeys: PaletteItem = {
    id: "action-character-keys",
    kind: "action",
    label: state.characterKeys
      ? "Switch single-key shortcuts off"
      : "Switch single-key shortcuts on",
    keywords: ["keyboard", "accessibility", "character keys", "hotkeys"],
    run: () => {
      actions.setCharacterKeys(!state.characterKeys);
    },
  };

  return [
    ...toViews,
    theme,
    ...(state.sidebarSwitchable ? [sidebar] : []),
    help,
    characterKeys,
  ];
}
