// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useContext, useEffect } from "react";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { type Log, renderWithShortcuts } from "../testing/shortcuts";
import { RegistryContext } from "./context";
import { parseBinding } from "./keys";
import { createRegistry, type Registry } from "./registry";

// What the registry does with a keydown event, which resolve.ts does not
// see: the rules about the event itself. They are tested on the registry
// alone, with events a keyboard cannot be made to send from a test: a
// repeat, a composition, AltGr as Windows reports it, another layout.

/** Registers a shortcut of the shell that writes its keys into the log. */
function register(registry: Registry, keys: string, log: Log): () => void {
  return registry.register({
    keys,
    binding: parseBinding(keys),
    scope: "global",
    description: keys,
    group: "Test",
    run: () => log.push(keys),
  });
}

/** A keydown as the browser would send it, which a handler may cancel. */
function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { cancelable: true, ...init });
}

/** A registry that reads Control as the modifier, with shortcuts in it. */
function registryWith(...keys: string[]): { registry: Registry; log: Log } {
  const registry = createRegistry(false);
  const log: Log = [];
  for (const each of keys) {
    register(registry, each, log);
  }
  return { registry, log };
}

describe("a keydown", () => {
  // The browser has uses of its own for many keys: "/" starts a search in
  // Firefox. A key that ran a shortcut must not do that as well.
  test("that runs a shortcut is taken from the browser", () => {
    const { registry, log } = registryWith("t");
    const event = keydown({ key: "t" });

    registry.handle(event);

    expect(log).toEqual(["t"]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("that no shortcut is registered for is left to the browser", () => {
    const { registry, log } = registryWith("t");
    const event = keydown({ key: "x" });

    registry.handle(event);

    expect(log).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  test("of the first key of a sequence is taken from the browser too", () => {
    const { registry, log } = registryWith("g o");
    const first = keydown({ key: "g" });

    registry.handle(first);
    registry.handle(keydown({ key: "o" }));

    expect(first.defaultPrevented).toBe(true);
    expect(log).toEqual(["g o"]);
  });

  // A key that is held down sends keydown after keydown. "t" held for a
  // second would switch the theme thirty times.
  test("that repeats a held key runs nothing", () => {
    const { registry, log } = registryWith("t");
    const event = keydown({ key: "t", repeat: true });

    registry.handle(event);

    expect(log).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  // While a character is composed, in Japanese or with a dead key, the
  // keys belong to the input method.
  test("that belongs to the composition of a character runs nothing", () => {
    const { registry, log } = registryWith("t");
    const event = keydown({ key: "t", isComposing: true });

    registry.handle(event);

    expect(log).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  // A list that moves its marker with a key calls preventDefault, and the
  // key is then not a shortcut as well.
  test("that something on the page has acted on runs nothing", () => {
    const { registry, log } = registryWith("t");
    const event = keydown({ key: "t" });
    event.preventDefault();

    registry.handle(event);

    expect(log).toEqual([]);
  });

  // "[" is AltGr and 8 on a German keyboard, and Windows reports AltGr as
  // Control and Alt held together. Only the event's own word that AltGr is
  // held tells that from a shortcut of the browser.
  test("typed with AltGr is the character, though Control and Alt are reported", () => {
    const { registry, log } = registryWith("[");

    registry.handle(
      keydown({
        key: "[",
        code: "Digit8",
        ctrlKey: true,
        altKey: true,
        modifierAltGraph: true,
      }),
    );
    // Control and Alt without AltGr is somebody else's shortcut.
    registry.handle(keydown({ key: "[", ctrlKey: true, altKey: true }));

    expect(log).toEqual(["["]);
  });

  // With a Russian or Greek layout the key that carries "K" types another
  // character. The palette still has to open.
  test.each(["л", "κ"])(
    "of Control and %s, on the key that carries K, is the palette's",
    (key) => {
      const { registry, log } = registryWith("mod+k");
      const event = keydown({ key, code: "KeyK", ctrlKey: true });

      registry.handle(event);

      expect(log).toEqual(["mod+k"]);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  test("with Command is the palette's on an Apple system", () => {
    const registry = createRegistry(true);
    const log: Log = [];
    register(registry, "mod+k", log);

    registry.handle(keydown({ key: "k", ctrlKey: true }));
    registry.handle(keydown({ key: "k", metaKey: true }));

    expect(log).toEqual(["mod+k"]);
  });
});

describe("a sequence under way", () => {
  // "g" on the page, then a dialog opens and closes, by a click, say. The
  // "o" that follows is a new key and goes nowhere.
  test("is dropped when a dialog opens", () => {
    const { registry, log } = registryWith("g o");

    registry.handle(keydown({ key: "g" }));
    const close = registry.openOverlay();
    close();
    registry.handle(keydown({ key: "o" }));

    expect(log).toEqual([]);
  });

  test("is dropped when the single-key shortcuts are switched", () => {
    const { registry, log } = registryWith("g o");

    registry.handle(keydown({ key: "g" }));
    registry.setCharacterKeys(false);
    registry.setCharacterKeys(true);
    registry.handle(keydown({ key: "o" }));

    expect(log).toEqual([]);
  });
});

describe("an open dialog", () => {
  // Two dialogs can be open for a moment, while one replaces the other.
  // The page's keys come back when the last of them has closed.
  test("keeps the keys from the page until every dialog has closed", () => {
    const { registry, log } = registryWith("t");
    const closeFirst = registry.openOverlay();
    const closeSecond = registry.openOverlay();

    registry.handle(keydown({ key: "t" }));
    closeFirst();
    registry.handle(keydown({ key: "t" }));
    expect(log).toEqual([]);

    closeSecond();
    registry.handle(keydown({ key: "t" }));
    expect(log).toEqual(["t"]);
  });
});

describe("the list of shortcuts", () => {
  // The help renders from this list and learns of a change by the
  // subscription: a new list each time, or React would not render again.
  test("is a new one after each change, which subscribers are told of", () => {
    const registry = createRegistry(false);
    let changes = 0;
    const unsubscribe = registry.subscribe(() => {
      changes += 1;
    });
    const empty = registry.listed();

    const remove = register(registry, "t", []);
    const one = registry.listed();
    expect(one.map((listed) => listed.keys)).toEqual(["t"]);
    expect(one).not.toBe(empty);
    expect(changes).toBe(1);

    remove();
    expect(registry.listed()).toEqual([]);
    expect(changes).toBe(2);

    unsubscribe();
    register(registry, "x", []);
    expect(changes).toBe(2);
  });
});

describe("the provider", () => {
  /**
   * Registers a shortcut that is never taken out again, as nothing in the
   * application does: with a shortcut left in the registry, a key shows
   * from outside whether the provider still listens.
   */
  function Outlives({ log }: { log: Log }) {
    const registry = useContext(RegistryContext);
    useEffect(() => {
      if (registry) {
        register(registry, "t", log);
      }
    }, [registry, log]);
    return null;
  }

  // A listener left on the window would keep the registry, and everything
  // its shortcuts close over, alive and acting after the application is
  // gone from the page.
  test("stops listening to the keyboard when it unmounts", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(<Outlives log={log} />);
    await userEvent.keyboard("t");
    expect(log).toEqual(["t"]);

    await screen.unmount();
    await userEvent.keyboard("t");

    expect(log).toEqual(["t"]);
  });
});
