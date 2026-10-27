// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { type View, views } from "../routing/views";
import { isCharacterKey, parseBinding } from "../shortcuts/keys";
import {
  type ShellActions,
  shellPaletteItems,
  shellShortcuts,
  type ShellState,
} from "./commands";

const state: ShellState = {
  theme: "light",
  rail: false,
  sidebarSwitchable: true,
  characterKeys: true,
};

/** Actions that write down what was asked of them. */
function recorder(): { done: string[]; actions: ShellActions } {
  const done: string[] = [];
  return {
    done,
    actions: {
      goTo: (view: View) => done.push(`go to ${view.id}`),
      togglePalette: () => done.push("toggle palette"),
      showHelp: () => done.push("show help"),
      openGallery: () => done.push("open gallery"),
      toggleTheme: () => done.push("toggle theme"),
      toggleSidebar: () => done.push("toggle sidebar"),
      setCharacterKeys: (on: boolean) =>
        done.push(`character keys ${on ? "on" : "off"}`),
    },
  };
}

describe("the shell's shortcuts", () => {
  // The keys of the design handoff (doc/design/README.md, "Interactions,
  // keys, motion"), without "r": there is nothing to reload yet. F6 is
  // not the handoff's: it is the key Base UI gives the region of the
  // toasts, listed so that the help names it.
  test("are the keys of the design handoff, and the key of the notifications", () => {
    const keys = shellShortcuts(state, recorder().actions).map(
      (shortcut) => shortcut.keys,
    );

    expect(keys).toEqual([
      "mod+k",
      "?",
      "t",
      "[",
      "Escape",
      "F6",
      ...["o", "n", "p", "r", "j", "s", "h", "a", "q", "d", "c", "x"].map(
        (letter) => `g ${letter}`,
      ),
    ]);
  });

  // Every view is reached from the keyboard, by the letter of its row in
  // the view table and under its own name in the help.
  test("go to every view of the view table", () => {
    const { done, actions } = recorder();
    const shortcuts = shellShortcuts(state, actions);

    for (const view of views) {
      const shortcut = shortcuts.find(
        (other) => other.keys === `g ${view.goKey}`,
      );
      expect(shortcut?.description, view.id).toBe(view.title);
      shortcut?.run?.();
    }

    expect(done).toEqual(views.map((view) => `go to ${view.id}`));
  });

  // Two shortcuts with the same keys would leave one of them dead, and
  // every one of them has to be readable by the registry.
  test("are all different and all well-formed", () => {
    const keys = shellShortcuts(state, recorder().actions).map(
      (shortcut) => shortcut.keys,
    );

    expect(new Set(keys).size).toBe(keys.length);
    for (const written of keys) {
      expect(() => parseBinding(written), written).not.toThrow();
    }
  });

  // With the character keys switched off, these are what is left, and the
  // palette is how the rest is reached (WCAG 2.1, success criterion
  // 2.1.4).
  test("leave the palette, Escape and the key of the notifications when the character keys are off", () => {
    const left = shellShortcuts(state, recorder().actions)
      .filter((shortcut) => !isCharacterKey(parseBinding(shortcut.keys)))
      .map((shortcut) => shortcut.keys);

    expect(left).toEqual(["mod+k", "Escape", "F6"]);
  });

  // The dialog acts on Escape. A second handler here would close things
  // behind its back, and a key held during the composition of a character
  // would close a dialog the user is typing into.
  test("list Escape without acting on it", () => {
    const escape = shellShortcuts(state, recorder().actions).find(
      (shortcut) => shortcut.keys === "Escape",
    );

    expect(escape?.run).toBeNull();
  });

  // On a narrow screen the sidebar is the rail and stays it. A shortcut
  // that changed nothing the user can see is taken out, and out of the
  // help with it.
  test("leave the sidebar's key out where the sidebar cannot be switched", () => {
    const sidebar = shellShortcuts(
      { ...state, sidebarSwitchable: false },
      recorder().actions,
    ).find((shortcut) => shortcut.keys === "[");

    expect(sidebar?.enabled).toBe(false);
  });
});

describe("the entries of the command palette", () => {
  test("go to every view, under its title and with its keywords", () => {
    const { done, actions } = recorder();
    const items = shellPaletteItems(state, actions).filter(
      (item) => item.kind === "view",
    );

    expect(items.map((item) => item.label)).toEqual(
      views.map((view) => view.title),
    );
    expect(items.map((item) => item.keywords)).toEqual(
      views.map((view) => view.keywords),
    );
    items.forEach((item) => {
      item.run();
    });
    expect(done).toEqual(views.map((view) => `go to ${view.id}`));
  });

  // What a shortcut does, the palette does too: it is the way to an
  // action for whoever has the character keys off or does not know them.
  test("offer what the character-key shortcuts do", () => {
    const { done, actions } = recorder();
    const items = shellPaletteItems(state, actions).filter(
      (item) => item.kind === "action",
    );

    expect(items.map((item) => item.label)).toEqual([
      "Switch to the dark theme",
      "Collapse the sidebar",
      "Show the keyboard shortcuts",
      "Open the component gallery",
      "Switch single-key shortcuts off",
    ]);
    items.forEach((item) => {
      item.run();
    });
    expect(done).toEqual([
      "toggle theme",
      "toggle sidebar",
      "show help",
      "open gallery",
      "character keys off",
    ]);
  });

  // An entry says what choosing it does now, not what it is called.
  test("name the state an action leads to", () => {
    const { done, actions } = recorder();
    const labels = shellPaletteItems(
      { ...state, theme: "dark", rail: true, characterKeys: false },
      actions,
    )
      .filter((item) => item.kind === "action")
      .map((item) => {
        item.run();
        return item.label;
      });

    expect(labels).toEqual([
      "Switch to the light theme",
      "Expand the sidebar",
      "Show the keyboard shortcuts",
      "Open the component gallery",
      "Switch single-key shortcuts on",
    ]);
    expect(done).toContain("character keys on");
  });

  test("leave the sidebar out where it cannot be switched", () => {
    const labels = shellPaletteItems(
      { ...state, sidebarSwitchable: false },
      recorder().actions,
    ).map((item) => item.label);

    expect(labels).not.toContain("Collapse the sidebar");
    expect(labels).not.toContain("Expand the sidebar");
  });

  // The id is the key of an entry in the list and part of the id of its
  // element on the page.
  test("have ids that are all different", () => {
    const ids = shellPaletteItems(state, recorder().actions).map(
      (item) => item.id,
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  // The shortcut shown beside an entry is the one that is registered for
  // the same thing.
  test("show the keys of the shortcut that does the same", () => {
    const { actions } = recorder();
    const registered = new Map(
      shellShortcuts(state, actions).map((shortcut) => [
        shortcut.keys,
        shortcut.description,
      ]),
    );

    for (const item of shellPaletteItems(state, actions)) {
      if (item.keys !== undefined) {
        expect(registered.has(item.keys), item.label).toBe(true);
      }
    }
  });
});
