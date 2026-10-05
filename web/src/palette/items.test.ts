// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { type Kind, type PaletteItem, search } from "./items";

function item(kind: Kind, label: string, ...keywords: string[]): PaletteItem {
  return { id: label, kind, label, keywords, run: () => undefined };
}

const items = [
  item("view", "Nodes"),
  item("view", "Jobs", "queue"),
  item("view", "Job history"),
  item("action", "Switch to the dark theme", "toggle theme"),
  item("action", "Collapse the sidebar", "navigation"),
];

/** What the palette would show: each group with its labels. */
function shown(query: string) {
  return search(query, items).map((group) => [
    group.kind,
    group.items.map(({ label }) => label),
  ]);
}

test("without a query everything is listed, kind by kind, as handed in", () => {
  expect(shown("")).toEqual([
    ["view", ["Nodes", "Jobs", "Job history"]],
    ["action", ["Switch to the dark theme", "Collapse the sidebar"]],
  ]);
});

test("a query leaves the entries it finds, best first inside each kind", () => {
  expect(shown("job")).toEqual([["view", ["Jobs", "Job history"]]]);
});

// Enter chooses the first entry of the list. That has to be the best match
// of all, so the kind that holds it comes first, even though views
// otherwise come before actions.
test("the kind with the best match comes first", () => {
  // The action's label starts with the query; the views hold it inside.
  expect(shown("s")).toEqual([
    ["action", ["Switch to the dark theme", "Collapse the sidebar"]],
    ["view", ["Jobs", "Nodes", "Job history"]],
  ]);
  // One view's label starts with it; the action is found by a keyword.
  expect(shown("n")).toEqual([
    ["view", ["Nodes"]],
    ["action", ["Collapse the sidebar"]],
  ]);
});

// The palette then says so in place of the list.
test("a query that finds nothing leaves no group", () => {
  expect(shown("zzz")).toEqual([]);
});
