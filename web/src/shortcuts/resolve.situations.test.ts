// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { at, entry, key, modK } from "../testing/resolve";
import { resolve } from "./resolve";

// When a shortcut may run at all: not while the user types, not behind a
// dialog, and not while its kind is switched off. Which shortcut a key
// press runs otherwise is resolve.test.ts.

describe("while the user types text", () => {
  const typing = { editable: true };

  // A letter typed into a field is text. Nothing may run, and the key
  // must reach the field: "handled" would keep it from being typed.
  test("a character key runs nothing and is left to the field", () => {
    const outcome = resolve([entry("t"), entry("g j")], key("t"), null, {
      ...at(0),
      ...typing,
    });

    expect(outcome).toEqual({ run: null, pending: null, handled: false });
  });

  test("a character key starts no sequence", () => {
    const outcome = resolve([entry("g j")], key("g"), null, {
      ...at(0),
      ...typing,
    });

    expect(outcome).toEqual({ run: null, pending: null, handled: false });
  });

  // "g" on the page, then a click into a field, then "j" typed there: the
  // letter belongs to the field.
  test("a sequence begun before does not end in the field", () => {
    const jobs = entry("g j");
    const first = resolve([jobs], key("g"), null, at(0));

    const second = resolve([jobs], key("j"), first.pending, {
      ...at(100),
      ...typing,
    });

    expect(second).toEqual({ run: null, pending: null, handled: false });
  });

  // Enter, Delete, Backspace and the arrow keys type no character and
  // still do something in a field. A view that binds Delete to "cancel the
  // job" must not cancel one while the user corrects a filter, and the
  // field must get the key.
  test.each(["Delete", "Backspace", "Enter", "ArrowDown", "Home"])(
    "%s runs nothing and is left to the field",
    (name) => {
      const entries = [entry(name, "view"), entry(name)];

      const outcome = resolve(entries, key(name), null, {
        ...at(0),
        ...typing,
      });

      expect(outcome).toEqual({ run: null, pending: null, handled: false });
    },
  );

  // Escape does nothing in a field, so a view may close its drawer by it
  // from wherever the focus is.
  test("Escape still runs its shortcut", () => {
    const close = entry("Escape", "view");

    const outcome = resolve([close], key("Escape"), null, {
      ...at(0),
      ...typing,
    });

    expect(outcome.run).toBe(close);
  });

  // The palette is opened and closed from its own text field.
  test("a shortcut with the modifier still runs", () => {
    const palette = entry("mod+k");
    const submit = entry("mod+Enter", "view");

    expect(resolve([palette], modK, null, { ...at(0), ...typing }).run).toBe(
      palette,
    );
    expect(
      resolve([submit], { key: "Enter", mod: true }, null, {
        ...at(0),
        ...typing,
      }).run,
    ).toBe(submit);
  });
});

describe("with character-key shortcuts switched off", () => {
  const off = { characterKeys: false };

  test("no character key runs anything or starts a sequence", () => {
    const entries = [entry("t"), entry("g j"), entry("?")];

    for (const character of ["t", "g", "?"]) {
      expect(
        resolve(entries, key(character), null, { ...at(0), ...off }),
        character,
      ).toEqual({ run: null, pending: null, handled: false });
    }
  });

  // What is left is how the user gets to everything else (WCAG 2.1,
  // success criterion 2.1.4, asks for the switch, not for no keyboard).
  test("a shortcut with the modifier still runs", () => {
    const palette = entry("mod+k");

    const outcome = resolve([palette], modK, null, { ...at(0), ...off });

    expect(outcome.run).toBe(palette);
  });

  // The criterion is about letters, digits and signs. A key that types
  // none is not set off by speech input, and stays.
  test("a key that types no character still runs", () => {
    const remove = entry("Delete", "view");

    const outcome = resolve([remove], key("Delete"), null, {
      ...at(0),
      ...off,
    });

    expect(outcome.run).toBe(remove);
  });
});

describe("while a dialog is open", () => {
  const open = { overlayOpen: true };

  // The page behind a dialog cannot be seen or used. A key that changed it
  // would act on something the user is not looking at: "g j" would swap
  // the view under the dialog.
  test("the character keys of the page do nothing", () => {
    const entries = [entry("t"), entry("g j"), entry("x", "view")];

    for (const character of ["t", "g", "x"]) {
      expect(
        resolve(entries, key(character), null, { ...at(0), ...open }),
        character,
      ).toEqual({ run: null, pending: null, handled: false });
    }
  });

  test("the character keys of the dialog run", () => {
    const inDialog = entry("x", "overlay");

    const outcome = resolve([inDialog, entry("x")], key("x"), null, {
      ...at(0),
      ...open,
    });

    expect(outcome.run).toBe(inDialog);
  });

  // The same holds for a key that types no character: Delete must not
  // cancel the job in the row behind the dialog, and Enter must not open
  // it.
  test.each(["Delete", "Enter", "ArrowDown", "Escape"])(
    "%s of the page does nothing",
    (name) => {
      const entries = [entry(name, "view"), entry(name, "global")];

      const outcome = resolve(entries, key(name), null, {
        ...at(0),
        ...open,
      });

      expect(outcome).toEqual({ run: null, pending: null, handled: false });
    },
  );

  test("a key of the dialog that types no character runs", () => {
    const inDialog = entry("Delete", "overlay");

    const outcome = resolve(
      [inDialog, entry("Delete", "view")],
      key("Delete"),
      null,
      { ...at(0), ...open },
    );

    expect(outcome.run).toBe(inDialog);
  });

  // The palette opens over the help, and closes by the keys it opened by:
  // its shortcut is the shell's, and the shell is not a view.
  test("a shortcut of the shell with the modifier still runs", () => {
    const palette = entry("mod+k", "global");

    const outcome = resolve([palette], modK, null, { ...at(0), ...open });

    expect(outcome.run).toBe(palette);
  });

  // A view's Control and Enter submits its form. Behind a dialog the form
  // is not what the user is looking at, modifier or not.
  test("a shortcut of the view with the modifier does nothing", () => {
    const submit = entry("mod+Enter", "view");
    const search = entry("mod+k", "view");

    expect(
      resolve([submit], { key: "Enter", mod: true }, null, {
        ...at(0),
        ...open,
      }),
    ).toEqual({ run: null, pending: null, handled: false });
    expect(resolve([search], modK, null, { ...at(0), ...open })).toEqual({
      run: null,
      pending: null,
      handled: false,
    });
  });

  test("a shortcut of the dialog with the modifier runs", () => {
    const send = entry("mod+Enter", "overlay");

    const outcome = resolve([send], { key: "Enter", mod: true }, null, {
      ...at(0),
      ...open,
    });

    expect(outcome.run).toBe(send);
  });
});
