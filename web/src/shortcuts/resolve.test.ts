// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { at, entry, key, modK, type } from "../testing/resolve";
import { type Entry, resolve, sequenceTimeout } from "./resolve";

// Which shortcut a key press runs: one key, a sequence of two, and the
// scopes. When a shortcut may run at all is resolve.situations.test.ts.

describe("a single key", () => {
  test("runs the shortcut registered for it and is taken from the browser", () => {
    const theme = entry("t");

    const [outcome] = type([theme, entry("[")], key("t"));

    expect(outcome?.run).toBe(theme);
    expect(outcome?.handled).toBe(true);
  });

  // The browser has uses of its own for most keys: "/" and "'" start a
  // search in Firefox. A key sdash has no shortcut for is left to it.
  test("that no shortcut is registered for is left to the browser", () => {
    const [outcome] = type([entry("t")], key("x"));

    expect(outcome).toEqual({ run: null, pending: null, handled: false });
  });

  test("with the modifier runs its shortcut", () => {
    const palette = entry("mod+k");

    const [outcome] = type([palette, entry("k")], modK);

    expect(outcome?.run).toBe(palette);
  });

  // A key that the help lists and something else acts on, as the dialogs
  // do with Escape, must not be taken from whoever acts on it.
  test("that is only listed runs nothing and is left alone", () => {
    const listed: Entry = { ...entry("Escape"), run: null };

    const [outcome] = type([listed], key("Escape"));

    expect(outcome).toEqual({ run: null, pending: null, handled: false });
  });
});

describe("a sequence", () => {
  const jobs = entry("g j");
  const nodes = entry("g n");
  const theme = entry("t");
  const all = [jobs, nodes, theme];

  test("runs its shortcut on the second key, and nothing on the first", () => {
    const [first, second] = type(all, key("g"), key("n"));

    expect(first?.run).toBeNull();
    expect(first?.pending?.key).toBe("g");
    expect(first?.handled).toBe(true);
    expect(second?.run).toBe(nodes);
    expect(second?.pending).toBeNull();
  });

  // "g" and then a key that goes nowhere is a slip. It must not do
  // something else instead: the theme stays as it is.
  test("that is mistyped does nothing at all, and ends", () => {
    const [, second, third] = type(all, key("g"), key("t"), key("t"));

    expect(second).toEqual({ run: null, pending: null, handled: true });
    // The sequence is over: the next "t" is the theme's again.
    expect(third?.run).toBe(theme);
  });

  test("is over once the wait has run out", () => {
    const first = resolve(all, key("g"), null, at(0));
    const late = resolve(all, key("t"), first.pending, at(sequenceTimeout + 1));

    expect(late.run).toBe(theme);
  });

  test("is still on at the end of the wait", () => {
    const first = resolve(all, key("g"), null, at(0));
    const intime = resolve(all, key("j"), first.pending, at(sequenceTimeout));

    expect(intime.run).toBe(jobs);
  });

  // The palette must open whatever was typed just before.
  test("gives way to a shortcut with the modifier", () => {
    const palette = entry("mod+k");

    const [, second] = type([...all, palette], key("g"), modK);

    expect(second?.run).toBe(palette);
    expect(second?.pending).toBeNull();
  });

  // Escape after "g" is the dialog's, or nobody's, and not swallowed as
  // the second key of a sequence.
  test("is ended by a key that types nothing, which is not swallowed", () => {
    const [, second] = type(all, key("g"), key("Escape"));

    expect(second).toEqual({ run: null, pending: null, handled: false });
  });
});

describe("the scopes", () => {
  test.each([
    { higher: "view", lower: "global" },
    { higher: "overlay", lower: "view" },
    { higher: "overlay", lower: "global" },
  ] as const)(
    "the $higher scope wins over the $lower scope for the same key",
    ({ higher, lower }) => {
      const above = entry("x", higher);
      const below = entry("x", lower);

      // Whichever was registered first.
      expect(type([above, below], key("x"))[0]?.run).toBe(above);
      expect(type([below, above], key("x"))[0]?.run).toBe(above);
    },
  );

  // A component mounted later is the more specific one, as a panel inside
  // a view is.
  test("in one scope the shortcut registered last wins", () => {
    const first = entry("x", "view");
    const second = entry("x", "view");

    expect(type([first, second], key("x"))[0]?.run).toBe(second);
  });

  test("a sequence is won by the higher scope too", () => {
    const view = entry("g j", "view");
    const global = entry("g j");

    expect(type([view, global], key("g"), key("j"))[1]?.run).toBe(view);
  });
});
