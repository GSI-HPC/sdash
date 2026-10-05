// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The registry of keyboard shortcuts: the list of what is registered at
// this moment, and the one listener that reads the keyboard for all of it.
// Components put shortcuts in and take them out again through
// useShortcuts; nothing else in the interface listens for a shortcut
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).

import { type Binding, chordOf, sameBinding } from "./keys";
import { type Entry, type Pending, resolve, type Scope } from "./resolve";

/** A shortcut as the help lists it. */
export interface Listed {
  readonly id: number;
  /** The keys as the shortcut was written, such as "g o". */
  readonly keys: string;
  readonly binding: Binding;
  readonly scope: Scope;
  /** What the shortcut does, in words for the user. */
  readonly description: string;
  /** The heading the help lists it under. */
  readonly group: string;
}

/** What a registration hands the registry. */
export type Registration = Omit<Listed, "id"> & Pick<Entry, "run">;

/** The registry, as the provider makes one for the application. */
export interface Registry {
  /** Adds a shortcut and returns the function that takes it out again. */
  readonly register: (registration: Registration) => () => void;
  /**
   * Says that a dialog is open over the page, until the returned function
   * is called. While one is, the shortcuts of the page below it rest
   * (resolve.ts says which).
   */
  readonly openOverlay: () => () => void;
  /** Whether the user has character-key shortcuts switched on. */
  readonly setCharacterKeys: (on: boolean) => void;
  /** Calls back whenever the list of shortcuts changes. */
  readonly subscribe: (changed: () => void) => () => void;
  /** The shortcuts registered now, in the order they were registered. */
  readonly listed: () => readonly Listed[];
  /** Acts on a key press; the provider hands it every keydown. */
  readonly handle: (event: KeyboardEvent) => void;
}

/** Whether the focus is where a key types text or chooses a value. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

/**
 * Reports a shortcut that is registered for keys another shortcut of the
 * same scope has already. Of the two only the later one ever runs
 * (resolve.ts), and the help lists both as if they worked, so this is a
 * mistake in the code and never something a user set up. It is reported
 * where the developer who made it looks, the console of a development
 * build, with the ids the registry gave both. A build for users reports
 * nothing and does not throw: the shortcut that lost is a defect the user
 * can work around, a page that stops is not.
 */
function reportTwin(
  entries: readonly (Entry & Listed)[],
  added: Entry & Listed,
): void {
  const twin = entries.find(
    (entry) =>
      entry.scope === added.scope && sameBinding(entry.binding, added.binding),
  );
  if (twin) {
    console.error(
      `sdash: the shortcut "${added.keys}" is registered twice in the scope ` +
        `"${added.scope}", with the id ${String(twin.id)} ` +
        `("${twin.description}") and with the id ${String(added.id)} ` +
        `("${added.description}"). Only the one registered last runs: ` +
        "give one of them other keys.",
    );
  }
}

/**
 * Makes a registry. The platform decides which key is the modifier of
 * shortcuts; a test names one, the application asks the browser.
 */
export function createRegistry(apple: boolean): Registry {
  let entries: readonly (Entry & Listed)[] = [];
  let nextId = 1;
  let overlays = 0;
  let characterKeys = true;
  let pending: Pending | null = null;
  const listeners = new Set<() => void>();

  function replace(next: readonly (Entry & Listed)[]) {
    // A new array each time: listed() is the snapshot React compares to
    // learn whether the help has to render again.
    entries = next;
    listeners.forEach((changed) => {
      changed();
    });
  }

  return {
    register(registration) {
      const entry = { ...registration, id: nextId++ };
      // Vite sets DEV in the development server and in the tests, and
      // leaves this out of the build the binary embeds.
      if (import.meta.env.DEV) {
        reportTwin(entries, entry);
      }
      replace([...entries, entry]);
      return () => {
        replace(entries.filter((other) => other !== entry));
      };
    },

    openOverlay() {
      overlays += 1;
      // A sequence begun on the page does not end inside the dialog.
      pending = null;
      return () => {
        overlays -= 1;
      };
    },

    setCharacterKeys(on) {
      characterKeys = on;
      pending = null;
    },

    subscribe(changed) {
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
      };
    },

    listed: () => entries,

    handle(event) {
      // A key that something on the page has already acted on is not a
      // shortcut as well. Nor is one that belongs to the composition of a
      // character, as in Japanese or with a dead key, or the repeats of a
      // key that is held down, which would run a shortcut many times.
      if (event.defaultPrevented || event.isComposing || event.repeat) {
        return;
      }
      const chord = chordOf(
        {
          key: event.key,
          code: event.code,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
          altGraph: event.getModifierState("AltGraph"),
        },
        apple,
      );
      if (!chord) {
        return;
      }
      const outcome = resolve(entries, chord, pending, {
        now: event.timeStamp,
        editable: isEditable(event.target),
        characterKeys,
        overlayOpen: overlays > 0,
      });
      pending = outcome.pending;
      if (outcome.handled) {
        event.preventDefault();
      }
      outcome.run?.run?.();
    },
  };
}
