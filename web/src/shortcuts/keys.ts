// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// How a shortcut is written and how a key press is read: the two sides
// that resolve.ts brings together. Nothing here touches the page, so all of
// it is tested without one.
//
// A shortcut is written as its keys, separated by a space when one follows
// the other: "t", "[", "?", "g o", "mod+k", "Escape". A key is the
// character it types, in lower case for a letter, or the name
// KeyboardEvent.key gives a key that types none. "mod+" in front stands for
// the modifier of the platform: Command on an Apple system and Control
// everywhere else.

/** One key press of a shortcut. */
export interface Chord {
  /** The character the key types, or the name of a key that types none. */
  readonly key: string;
  /** Whether the modifier of the platform is held with it. */
  readonly mod: boolean;
}

/** The key presses of a shortcut, one or two. */
export type Binding = readonly [Chord] | readonly [Chord, Chord];

/** What a keydown event says, reduced to what matching needs. */
export interface KeyPress {
  readonly key: string;
  /** The place of the key on the keyboard, as KeyboardEvent.code names it. */
  readonly code: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /** Whether the event reports the AltGr key as held. */
  readonly altGraph: boolean;
}

const modPrefix = "mod+";

function parseChord(written: string, keys: string): Chord {
  const mod = written.startsWith(modPrefix);
  const key = mod ? written.slice(modPrefix.length) : written;
  if (key === "" || (key.length === 1 && key !== key.toLowerCase())) {
    throw new Error(
      `"${keys}" is not a shortcut: a key is one character, a letter in lower case, or the name of a key`,
    );
  }
  return { key, mod };
}

/**
 * Reads a shortcut as it is written. A mistake in one is a mistake in the
 * code and throws: a sequence is two plain characters, because a second key
 * with a modifier, or after one, is not something a person can be told in
 * a line of the help.
 */
export function parseBinding(keys: string): Binding {
  const chords = keys.split(" ").map((written) => parseChord(written, keys));
  const [first, second, ...more] = chords;
  if (!first || more.length > 0) {
    throw new Error(`"${keys}" is not a shortcut: it has one key or two`);
  }
  if (!second) {
    return [first];
  }
  if (chords.some((chord) => chord.mod || chord.key.length !== 1)) {
    throw new Error(
      `"${keys}" is not a shortcut: a sequence is two characters without a modifier`,
    );
  }
  return [first, second];
}

/**
 * Whether a shortcut is typed with character keys alone: a letter, a digit
 * or a sign, with nothing held but Shift. These are the shortcuts WCAG 2.1
 * (success criterion 2.1.4) asks to be switchable, since speech input and
 * a hand resting on the keyboard set them off by accident. They are also
 * the ones that must stay quiet while the user types text.
 */
export function isCharacterKey(binding: Binding): boolean {
  const [first] = binding;
  return !first.mod && first.key.length === 1;
}

/** Whether a letter has an upper and a lower case, as a sign has not. */
function isLetter(key: string): boolean {
  return key.toLowerCase() !== key.toUpperCase();
}

/** The letter a key has on a Latin keyboard, read from its place: "KeyK". */
const latinKey = /^Key([A-Z])$/;

/**
 * The key of a press with the modifier of the platform. With a keyboard
 * layout that types another script, Russian, Greek or Hebrew, say, the key
 * that carries "K" types another character, and Control with it would be a
 * shortcut nobody registered. A chord with the modifier is not text, so
 * for a character outside ASCII the letter is the one of the key's place,
 * which is also what the key cap shows beside its own script. A Latin
 * layout that moves the letters, AZERTY or Dvorak, types ASCII and keeps
 * its own.
 */
function modifiedKey(press: KeyPress): string {
  if (press.key.length !== 1 || press.key <= "\u007f") {
    return press.key;
  }
  return latinKey.exec(press.code)?.[1] ?? press.key;
}

/** The keys that only modify another and are never part of a shortcut. */
const modifierKeys = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "OS",
]);

/**
 * Reads a key press as the key of a shortcut. Null when it can be none:
 * the press of a modifier by itself, or a key held together with a
 * modifier that no shortcut uses, which then belongs to the browser or the
 * system.
 *
 * Shift is not asked for: "?" is the character whichever keys type it. A
 * letter is the exception, where Shift makes it another key: "G" is not
 * "g". Caps Lock alone does not, so a shortcut works with it on.
 *
 * AltGr, and Option on an Apple system, are how a keyboard layout types
 * its third level: "[" is AltGr and 8 on a German keyboard. Windows reports
 * AltGr as Control and Alt held together. Neither counts as a modifier
 * here, or those characters could not be typed as shortcuts at all.
 *
 * A shortcut without the modifier is the character the layout types and
 * nothing else: "t" does nothing while the keyboard types Cyrillic. With
 * the modifier the place of the key counts as well (modifiedKey).
 */
export function chordOf(press: KeyPress, apple: boolean): Chord | null {
  if (modifierKeys.has(press.key)) {
    return null;
  }
  const typesThirdLevel = press.altGraph || (apple && press.alt);
  const ctrl = press.ctrl && !press.altGraph;
  const alt = press.alt && !typesThirdLevel;
  const mod = apple ? press.meta : ctrl;
  const foreign = apple ? ctrl : press.meta;
  if (alt || foreign) {
    return null;
  }

  let key = mod ? modifiedKey(press) : press.key;
  if (key.length === 1 && isLetter(key)) {
    key = press.shift ? key.toUpperCase() : key.toLowerCase();
  }
  return { key, mod };
}

/** Whether two key presses are the same. */
export function sameChord(one: Chord, other: Chord): boolean {
  return one.key === other.key && one.mod === other.mod;
}

/** Whether two shortcuts are typed with the same keys. */
export function sameBinding(one: Binding, other: Binding): boolean {
  return (
    one.length === other.length &&
    one.every((chord, position) => {
      const counterpart = other[position];
      return counterpart !== undefined && sameChord(chord, counterpart);
    })
  );
}

/**
 * Whether a platform, as navigator.platform names it, is one of Apple's,
 * where the modifier of shortcuts is Command and not Control.
 */
export function isApplePlatform(platform: string): boolean {
  return /^(mac|iphone|ipad|ipod)/i.test(platform);
}

/** How the help and the buttons name a key that types no character. */
const keyNames: Record<string, string> = { Escape: "Esc" };

/**
 * A shortcut as it is shown to the user: for each of its key presses the
 * caps to draw, such as [["Ctrl", "K"]] or [["g"], ["o"]]. A letter with
 * the modifier is shown in upper case, as it is printed on the key; a
 * letter by itself as it is typed.
 */
export function keyCaps(binding: Binding, apple: boolean): string[][] {
  return binding.map(({ key, mod }) => {
    const name = keyNames[key] ?? key;
    return mod ? [apple ? "⌘" : "Ctrl", name.toUpperCase()] : [name];
  });
}

/**
 * A shortcut as the aria-keyshortcuts attribute spells it, for assistive
 * technology to announce with the control. Undefined for a sequence: the
 * attribute has no way to say "one key and then another", and a space in
 * it separates alternatives.
 */
export function ariaKeyShortcuts(
  binding: Binding,
  apple: boolean,
): string | undefined {
  if (binding.length > 1) {
    return undefined;
  }
  const [{ key, mod }] = binding;
  const name = key.length === 1 ? key.toUpperCase() : key;
  return mod ? `${apple ? "Meta" : "Control"}+${name}` : name;
}

/** How a cap is read out where its sign would be skipped or misread. */
const capNames: Record<string, string> = {
  "⌘": "Command",
  Ctrl: "Control",
  Esc: "Escape",
  "[": "left square bracket",
  "]": "right square bracket",
  "?": "question mark",
  "/": "slash",
};

/**
 * A shortcut in words, for a screen reader: "Control K", "g then o",
 * "left square bracket". Many read a sign such as "[" only at a
 * punctuation setting few users have, and the Command sign as something
 * else entirely.
 */
export function spokenKeys(binding: Binding, apple: boolean): string {
  return keyCaps(binding, apple)
    .map((caps) => caps.map((cap) => capNames[cap] ?? cap).join(" "))
    .join(" then ");
}
