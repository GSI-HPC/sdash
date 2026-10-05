// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { helpGroups } from "./help";
import { parseBinding } from "./keys";
import type { Listed } from "./registry";

let nextId = 1;

function listed(keys: string, description: string, group: string): Listed {
  return {
    id: nextId++,
    keys,
    binding: parseBinding(keys),
    scope: "global",
    description,
    group,
  };
}

/** What the help would show: each heading with its lines. */
function shown(shortcuts: readonly Listed[]) {
  return helpGroups(shortcuts).map(({ group, shortcuts: lines }) => [
    group,
    lines.map((line) => `${line.keys}: ${line.description}`),
  ]);
}

// The shell registers its shortcuts in the order a user should read them,
// and a view adds its own afterwards. The help keeps that order and sorts
// nothing.
test("the help lists shortcuts under their headings in the order they were registered", () => {
  expect(
    shown([
      listed("mod+k", "Open the palette", "General"),
      listed("g j", "Jobs", "Go to"),
      listed("t", "Switch the theme", "General"),
      listed("g n", "Nodes", "Go to"),
    ]),
  ).toEqual([
    ["General", ["mod+k: Open the palette", "t: Switch the theme"]],
    ["Go to", ["g j: Jobs", "g n: Nodes"]],
  ]);
});

// Two instances of one component register the same shortcut twice. To the
// user it is one.
test("a shortcut registered twice is listed once", () => {
  expect(
    shown([
      listed("x", "Expand the row", "Table"),
      listed("x", "Expand the row", "Table"),
    ]),
  ).toEqual([["Table", ["x: Expand the row"]]]);
});

// The same keys for two different things are two lines: the user has to
// see both to learn that the key depends on where they are.
test("the same keys with another meaning are listed again", () => {
  expect(
    shown([
      listed("x", "Expand the row", "Table"),
      listed("x", "Close the panel", "Table"),
    ]),
  ).toEqual([["Table", ["x: Expand the row", "x: Close the panel"]]]);
});
