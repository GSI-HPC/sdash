// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Decides what a key press does: which registered shortcut it runs, if
// any, and whether it is the first key of a sequence. It is a function of
// what it is given and keeps no state, so every rule below is a unit test
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).

import { type Binding, type Chord, isCharacterKey, sameChord } from "./keys";

/**
 * Where a shortcut applies. A higher scope wins over a lower one for the
 * same keys: a view may give a key a meaning of its own, and so may a
 * dialog that lies over the view.
 */
export const scopes = ["global", "view", "overlay"] as const;

/** One of the scopes. */
export type Scope = (typeof scopes)[number];

/** A shortcut as the registry holds it. */
export interface Entry {
  /** Counts up with each registration, so a later one has a higher id. */
  readonly id: number;
  readonly binding: Binding;
  readonly scope: Scope;
  /**
   * What the shortcut does. Null for a key that something else handles and
   * the help still has to list.
   */
  readonly run: (() => void) | null;
}

/** The first key of a sequence, waiting for the second. */
export interface Pending {
  readonly key: string;
  /** The time the wait ends, on the clock of Situation.now. */
  readonly until: number;
}

/** What holds at the moment of a key press. */
export interface Situation {
  /** The time of the press, in milliseconds on any steady clock. */
  readonly now: number;
  /** Whether the focus is where the user types text. */
  readonly editable: boolean;
  /** Whether the user has character-key shortcuts switched on. */
  readonly characterKeys: boolean;
  /** Whether a dialog is open over the page. */
  readonly overlayOpen: boolean;
}

/** What a key press leads to. */
export interface Outcome {
  /** The shortcut to run, if the press completes one. */
  readonly run: Entry | null;
  /** The sequence that is under way after the press, if any. */
  readonly pending: Pending | null;
  /**
   * Whether the press was the registry's: the browser is then kept from
   * acting on it as well.
   */
  readonly handled: boolean;
}

/**
 * How long the second key of a sequence may take, in milliseconds. The
 * design's prototype waits this long.
 */
export const sequenceTimeout = 1200;

const nothing: Outcome = { run: null, pending: null, handled: false };

/** The one key without the modifier that a text field has no use for. */
const escapeKey = "Escape";

/** The entry that wins among several for the same keys. */
function winner(entries: readonly Entry[]): Entry | null {
  let best: Entry | null = null;
  for (const entry of entries) {
    const higher =
      best === null ||
      scopes.indexOf(entry.scope) > scopes.indexOf(best.scope) ||
      (entry.scope === best.scope && entry.id > best.id);
    if (higher) {
      best = entry;
    }
  }
  return best;
}

/**
 * Whether a shortcut can run in a situation at all. These are the rules
 * every shortcut gets from the registry, so that no component has to
 * remember them:
 *
 * - A shortcut of a view does not run behind a dialog, whatever its keys:
 *   the view is not what the user is looking at, and Control and Enter in a
 *   dialog must not submit the form below it.
 * - A shortcut with the modifier of the platform has no other limit, since
 *   a person does not hit it by accident, and the palette has to open from
 *   a text field and over another dialog.
 * - A shortcut without the modifier does not run behind a dialog either,
 *   nor while the focus is where text is typed. That holds for a key that
 *   types no character too: Enter, Delete, Backspace and the arrow keys all
 *   do something in a text field, which would lose the key to the
 *   shortcut. Escape is the exception, because it does nothing there.
 * - A shortcut typed with character keys alone runs only while the user
 *   has such shortcuts switched on (WCAG 2.1, success criterion 2.1.4,
 *   which is about these keys and no others).
 */
function isLive(entry: Entry, situation: Situation): boolean {
  if (entry.run === null) {
    return false;
  }
  const [first] = entry.binding;
  if (situation.overlayOpen && entry.scope === "view") {
    return false;
  }
  if (first.mod) {
    return true;
  }
  if (situation.overlayOpen && entry.scope !== "overlay") {
    return false;
  }
  if (situation.editable && first.key !== escapeKey) {
    return false;
  }
  return situation.characterKeys || !isCharacterKey(entry.binding);
}

/**
 * Decides what a key press does: the shortcut that isLive lets through and
 * that wins for the keys, if there is one.
 *
 * The first key of a sequence starts a wait. The next character key ends
 * it whether it completes a sequence or not, and does nothing else: "g"
 * and then "t" goes nowhere and leaves the theme alone, as a mistyped
 * sequence should.
 */
export function resolve(
  entries: readonly Entry[],
  chord: Chord,
  pending: Pending | null,
  situation: Situation,
): Outcome {
  const characters = situation.characterKeys && !situation.editable;
  const live = entries.filter((entry) => isLive(entry, situation));

  const typed = !chord.mod && chord.key.length === 1;

  if (typed && characters && pending && situation.now <= pending.until) {
    const second: Chord = chord;
    const run = winner(
      live.filter(
        ({ binding }) =>
          binding.length === 2 &&
          binding[0].key === pending.key &&
          sameChord(binding[1], second),
      ),
    );
    return { run, pending: null, handled: true };
  }

  if (typed && characters) {
    const starts = live.some(
      ({ binding }) => binding.length === 2 && binding[0].key === chord.key,
    );
    if (starts) {
      return {
        run: null,
        pending: { key: chord.key, until: situation.now + sequenceTimeout },
        handled: true,
      };
    }
  }

  const run = winner(
    live.filter(
      ({ binding }) => binding.length === 1 && sameChord(binding[0], chord),
    ),
  );
  return run ? { run, pending: null, handled: true } : nothing;
}
