// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import {
  ariaKeyShortcuts,
  chordOf,
  isApplePlatform,
  isCharacterKey,
  keyCaps,
  type KeyPress,
  parseBinding,
  spokenKeys,
} from "./keys";

/** A key press with nothing held, changed by what a test names. */
function press(key: string, held: Partial<KeyPress> = {}): KeyPress {
  return {
    key,
    // No place on the keyboard unless a test names one: most of the
    // matching goes by the character alone.
    code: "",
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    altGraph: false,
    ...held,
  };
}

describe("a shortcut as it is written", () => {
  test.each([
    { keys: "t", binding: [{ key: "t", mod: false }] },
    { keys: "[", binding: [{ key: "[", mod: false }] },
    { keys: "?", binding: [{ key: "?", mod: false }] },
    { keys: "Escape", binding: [{ key: "Escape", mod: false }] },
    { keys: "mod+k", binding: [{ key: "k", mod: true }] },
    {
      keys: "g o",
      binding: [
        { key: "g", mod: false },
        { key: "o", mod: false },
      ],
    },
  ])("$keys is read as its key presses", ({ keys, binding }) => {
    expect(parseBinding(keys)).toEqual(binding);
  });

  // A shortcut is written by whoever registers it, so one that cannot be
  // read is a mistake in the code. It is refused when it is registered and
  // not left to never fire: "T" could only be typed with Shift, which
  // the matching takes for another key, and a sequence with a modifier in
  // it cannot be shown to a user in a way they would guess.
  test.each([
    "",
    " ",
    "T",
    "mod+",
    "mod+K",
    "g o o",
    "g mod+o",
    "mod+g o",
    "g Escape",
  ])("%j is refused", (keys) => {
    expect(() => parseBinding(keys)).toThrow(/is not a shortcut/);
  });
});

describe("the shortcuts that can be switched off", () => {
  // WCAG 2.1 (success criterion 2.1.4) is about shortcuts made of letters,
  // digits and signs alone. Those are also the ones that must not fire
  // while the user types.
  test.each(["t", "[", "?", "g o"])(
    "%s is typed with character keys",
    (keys) => {
      expect(isCharacterKey(parseBinding(keys))).toBe(true);
    },
  );

  // The palette and Escape have to stay: with the others off, the palette
  // is how everything is still reached.
  test.each(["mod+k", "Escape"])("%s is not", (keys) => {
    expect(isCharacterKey(parseBinding(keys))).toBe(false);
  });
});

describe("a key press", () => {
  test("is the character it types", () => {
    expect(chordOf(press("t"), false)).toEqual({ key: "t", mod: false });
  });

  // With Caps Lock on, the key reports "T" and Shift is not held. A user
  // who has it on by accident must not find every shortcut dead.
  test("is the same letter with Caps Lock on", () => {
    expect(chordOf(press("T"), false)).toEqual({ key: "t", mod: false });
  });

  // Shift and a letter is another key: browsers and the system have
  // shortcuts of their own there, and a later one of sdash may want it.
  test("is another key when Shift is held with a letter", () => {
    expect(chordOf(press("T", { shift: true }), false)).toEqual({
      key: "T",
      mod: false,
    });
  });

  // "?" is Shift and "/" on one keyboard, Shift and "ß" on another. The
  // character is what the shortcut names, so Shift is not asked about.
  test("is the sign whichever keys type it", () => {
    expect(chordOf(press("?", { shift: true }), false)).toEqual({
      key: "?",
      mod: false,
    });
  });

  test.each([
    { platform: "elsewhere", apple: false, held: { ctrl: true } },
    { platform: "an Apple system", apple: true, held: { meta: true } },
  ])("carries the modifier of the platform on $platform", ({ apple, held }) => {
    expect(chordOf(press("k", held), apple)).toEqual({ key: "k", mod: true });
  });

  // Control and K is "delete to the end of the line" in every text field
  // of macOS, and the Windows key belongs to the system. Neither is ever
  // sdash's.
  test.each([
    { platform: "elsewhere", apple: false, held: { meta: true } },
    { platform: "an Apple system", apple: true, held: { ctrl: true } },
  ])(
    "is no shortcut with the other platform's modifier on $platform",
    ({ apple, held }) => {
      expect(chordOf(press("k", held), apple)).toBeNull();
    },
  );

  // With a Russian, Greek or Hebrew layout active, the key that carries
  // "K" types another character. Control with it is no text, and the
  // palette, the one way to everything without the single keys, has to
  // open: the letter is then the one of the key's place.
  test.each([
    { layout: "Russian", key: "л" },
    { layout: "Greek", key: "κ" },
    { layout: "Hebrew", key: "ל" },
  ])(
    "with the modifier is the Latin letter of its place in a $layout layout",
    ({ key }) => {
      expect(chordOf(press(key, { code: "KeyK", ctrl: true }), false)).toEqual({
        key: "k",
        mod: true,
      });
      expect(chordOf(press(key, { code: "KeyK", meta: true }), true)).toEqual({
        key: "k",
        mod: true,
      });
    },
  );

  test("with the modifier and Shift in such a layout is the upper-case letter", () => {
    expect(
      chordOf(press("Л", { code: "KeyK", ctrl: true, shift: true }), false),
    ).toEqual({ key: "K", mod: true });
  });

  // AZERTY has "A" where QWERTY has "Q", and its user means the letter on
  // the key cap. A layout that types ASCII keeps the character it types.
  test("with the modifier is the character it types in a Latin layout", () => {
    expect(chordOf(press("a", { code: "KeyQ", ctrl: true }), false)).toEqual({
      key: "a",
      mod: true,
    });
  });

  // A key that is no letter on a Latin keyboard has none to stand in:
  // "ö" is where ";" is.
  test("with the modifier keeps a character whose place has no Latin letter", () => {
    expect(
      chordOf(press("ö", { code: "Semicolon", ctrl: true }), false),
    ).toEqual({ key: "ö", mod: true });
  });

  // Without the modifier the key is text, and the text is not "t". The
  // single-key shortcuts rest while the keyboard types another script.
  test("without the modifier is the character of the layout", () => {
    expect(chordOf(press("е", { code: "KeyT" }), false)).toEqual({
      key: "е",
      mod: false,
    });
  });

  // Alt and a letter opens a menu of the browser on Windows and Linux.
  test("is no shortcut with Alt held", () => {
    expect(chordOf(press("t", { alt: true }), false)).toBeNull();
  });

  // On a German keyboard "[" is AltGr and 8. Windows reports AltGr as
  // Control and Alt held together, so without this the sidebar's shortcut
  // could not be typed there at all.
  test("is the character AltGr types, though Windows reports Control and Alt", () => {
    expect(
      chordOf(press("[", { ctrl: true, alt: true, altGraph: true }), false),
    ).toEqual({ key: "[", mod: false });
  });

  // The same character is Option and 5 on a German Apple keyboard.
  test("is the character Option types on an Apple system", () => {
    expect(chordOf(press("[", { alt: true }), true)).toEqual({
      key: "[",
      mod: false,
    });
  });

  // Holding Shift on the way to "?" is a keydown of its own. It must not
  // count as the second key of a sequence, or as anything.
  test.each(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"])(
    "of %s alone is no key of a shortcut",
    (key) => {
      expect(chordOf(press(key), false)).toBeNull();
    },
  );
});

describe("a shortcut as it is shown", () => {
  test.each([
    { keys: "mod+k", apple: false, caps: [["Ctrl", "K"]] },
    { keys: "mod+k", apple: true, caps: [["⌘", "K"]] },
    { keys: "g o", apple: false, caps: [["g"], ["o"]] },
    { keys: "Escape", apple: false, caps: [["Esc"]] },
    { keys: "[", apple: true, caps: [["["]] },
  ])("$keys has the caps $caps", ({ keys, apple, caps }) => {
    expect(keyCaps(parseBinding(keys), apple)).toEqual(caps);
  });

  // A screen reader reads "[" only at a punctuation setting few users
  // have, and the Command sign as "place of interest". The words are what
  // it is given.
  test.each([
    { keys: "mod+k", apple: false, words: "Control K" },
    { keys: "mod+k", apple: true, words: "Command K" },
    { keys: "g o", apple: false, words: "g then o" },
    { keys: "[", apple: false, words: "left square bracket" },
    { keys: "?", apple: false, words: "question mark" },
    { keys: "Escape", apple: false, words: "Escape" },
  ])("$keys is read out as $words", ({ keys, apple, words }) => {
    expect(spokenKeys(parseBinding(keys), apple)).toBe(words);
  });

  test.each([
    { keys: "mod+k", apple: false, value: "Control+K" },
    { keys: "mod+k", apple: true, value: "Meta+K" },
    { keys: "t", apple: false, value: "T" },
    { keys: "[", apple: false, value: "[" },
    { keys: "Escape", apple: false, value: "Escape" },
  ])("$keys is $value in aria-keyshortcuts", ({ keys, apple, value }) => {
    expect(ariaKeyShortcuts(parseBinding(keys), apple)).toBe(value);
  });

  // A space in aria-keyshortcuts separates alternatives: "G O" would tell
  // a screen reader that either key alone does it.
  test("a sequence has no value in aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts(parseBinding("g o"), false)).toBeUndefined();
  });
});

describe("the platform", () => {
  test.each(["MacIntel", "MacPPC", "iPhone", "iPad"])(
    "%s has Command as its modifier",
    (platform) => {
      expect(isApplePlatform(platform)).toBe(true);
    },
  );

  // An unknown platform gets Control, which is right for all but Apple's.
  test.each(["Linux x86_64", "Win32", "FreeBSD amd64", ""])(
    "%j has Control",
    (platform) => {
      expect(isApplePlatform(platform)).toBe(false);
    },
  );
});
