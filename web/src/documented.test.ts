// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import agents from "../../AGENTS.md?raw";
import shell from "../../doc/ui.md?raw";

// Two documents say where things are under web/src: AGENTS.md, for a
// coding agent that has just arrived, and doc/ui.md, for whoever builds a
// view. A directory that neither names is one a newcomer does not know to
// look in, and a new directory arrives without anybody thinking of the
// two lists.

/** The directories of web/src, from the files Vite finds in them. */
const directories = [
  ...new Set(
    Object.keys(import.meta.glob("./*/**")).map((file) => file.split("/")[1]),
  ),
].sort();

/** The part of a document from a line that starts it to a line that ends it. */
function part(document: string, from: string, to: string): string {
  const start = document.indexOf(from);
  const end = document.indexOf(to, start + from.length);
  if (start < 0 || end < 0) {
    throw new Error(`the document has no part from "${from}" to "${to}"`);
  }
  return document.slice(start, end);
}

/** The directories a text names, as it writes them: `name/`. */
function named(text: string): string[] {
  return [...text.matchAll(/`([a-z]+)\/`/g)].map(([, name = ""]) => name);
}

// The premise of both tests: the directories were found.
test("web/src has the directories of the shell", () => {
  expect(directories).toContain("routing");
  expect(directories).toContain("testing");
});

test("the layout in AGENTS.md names every directory of web/src, and none that is not there", () => {
  const layout = part(agents, "- `web/src/`:", "\n- `doc/`:");

  expect(named(layout).sort()).toEqual(directories);
});

test("the table in doc/ui.md names every directory of web/src, and none that is not there", () => {
  const table = part(shell, "## Where things are", "\n## ");

  expect(named(table).sort()).toEqual(directories);
});
