// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the unit tests of shortcuts/resolve.ts share: shortcuts as the
// registry holds them, key presses, and the situation of a press. Only
// tests import it.

import { type Chord, parseBinding } from "../shortcuts/keys";
import {
  type Entry,
  type Outcome,
  type Pending,
  resolve,
  type Scope,
  type Situation,
} from "../shortcuts/resolve";

let nextId = 1;

/** A registered shortcut that does nothing; a test asks which one won. */
export function entry(keys: string, scope: Scope = "global"): Entry {
  return {
    id: nextId++,
    binding: parseBinding(keys),
    scope,
    run: () => undefined,
  };
}

/** The key press of a plain character. */
export function key(character: string): Chord {
  return { key: character, mod: false };
}

/** The key press of the palette's shortcut: K with the modifier. */
export const modK: Chord = { key: "k", mod: true };

/** The situation of a user who is not typing, with nothing open. */
export function at(now: number, changed: Partial<Situation> = {}): Situation {
  return {
    now,
    editable: false,
    characterKeys: true,
    overlayOpen: false,
    ...changed,
  };
}

/** Presses keys one after the other, a hundred milliseconds apart. */
export function type(entries: readonly Entry[], ...chords: Chord[]): Outcome[] {
  let pending: Pending | null = null;
  return chords.map((chord, index) => {
    const outcome = resolve(entries, chord, pending, at(index * 100));
    pending = outcome.pending;
    return outcome;
  });
}
