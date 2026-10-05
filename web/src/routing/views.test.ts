// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { icons } from "../icons/paths";
import {
  documentTitle,
  groups,
  leadsTo,
  rootPath,
  startView,
  viewAt,
  viewOf,
  views,
  viewsByGroup,
} from "./views";

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("the view table", () => {
  // The routes, the navigation, the shortcuts and the palette are all made
  // from the table. Two rows with one id, one address or one letter would
  // make two views answer to the same thing, and the second would never be
  // reached.
  test.each([
    { what: "id", of: views.map((view) => view.id) },
    { what: "address", of: views.map((view) => view.path) },
    { what: "letter after g", of: views.map((view) => view.goKey) },
    { what: "title", of: views.map((view) => view.title) },
  ])("gives no two views the same $what", ({ of }) => {
    expect(duplicates(of)).toEqual([]);
  });

  // An address is one segment below the root, in lower case: what the
  // server answers with the application, what a user can type, and what
  // leaves the rest of the path free for what a view puts below it later.
  test("gives every view an address of one lower-case segment", () => {
    for (const view of views) {
      expect(view.path, view.id).toMatch(/^\/[a-z][a-z-]*$/);
    }
  });

  // The address is how a view is named outside the code, the id inside
  // it. A view whose two names differ would have to be looked up to be
  // found from either.
  test("names every view the same in its address and its id", () => {
    for (const view of views) {
      expect(view.path).toBe(`/${view.id}`);
    }
  });

  // The letter is typed after "g" as a character-key shortcut, which
  // shortcuts/keys.ts reads as one lower-case character.
  test("gives every view one lower-case letter", () => {
    for (const view of views) {
      expect(view.goKey, view.id).toMatch(/^[a-z]$/);
    }
  });

  // The design handoff fixes the views, their order in the navigation and
  // their letters (doc/design/README.md, "Global layout" and
  // "Interactions, keys, motion"). The table is where a change to any of
  // them is made, and this is where it is noticed.
  test("has the views, the groups and the letters of the design handoff", () => {
    expect(
      viewsByGroup().map(({ group, views: inGroup }) => [
        group,
        inGroup.map((view) => `${view.goKey} ${view.title}`),
      ]),
    ).toEqual([
      ["Cluster", ["o Overview", "n Nodes", "p Partitions", "r Reservations"]],
      ["Workload", ["j Jobs", "s Submit job", "h Job history"]],
      ["Accounting", ["a Accounts & users", "q QOS & fairshare"]],
      ["System", ["d Diagnostics", "c slurm.conf", "x API explorer"]],
    ]);
  });

  // A view in no group would have a route and no entry in the navigation.
  test("lists every view under one of the groups", () => {
    const listed = viewsByGroup().flatMap(({ views: inGroup }) => inGroup);

    expect(listed).toHaveLength(views.length);
    expect(viewsByGroup().map(({ group }) => group)).toEqual([...groups]);
  });

  test("gives every view an icon that exists and a line that says what it shows", () => {
    for (const view of views) {
      expect(Object.keys(icons), view.id).toContain(view.icon);
      expect(view.summary.trim(), view.id).not.toBe("");
    }
  });

  // The root address has to lead somewhere, and the design starts with the
  // Overview.
  test("starts with the Overview", () => {
    expect(startView.id).toBe("overview");
  });

  test("finds the row of every view by its id", () => {
    for (const view of views) {
      expect(viewOf(view.id)).toBe(view);
    }
  });
});

describe("the view an address shows", () => {
  test("is the view whose address it is", () => {
    for (const view of views) {
      expect(viewAt(view.path)).toBe(view);
    }
  });

  // A router reads "/Nodes" and "/nodes/" as "/nodes", and a link that
  // marks itself as current reads "/nodes/r07" as inside "/nodes". A view
  // would then show under addresses the view table does not have, and the
  // navigation would mark a view while the not-found view shows. So an
  // address is compared letter for letter, and these belong to no view.
  test.each([
    "/Nodes",
    "/NODES",
    "/nodes/",
    "/nodes//",
    "/nodes/r07",
    "//nodes",
    "/nodes ",
    "/%6Eodes",
    "/node",
    "/nodesx",
    "nodes",
    "",
  ])("is none for %j, which is no view's own address", (address) => {
    expect(viewAt(address)).toBeUndefined();
  });

  // The root leads on to the start view and is not an address of it.
  test("is none for the root", () => {
    expect(viewAt(rootPath)).toBeUndefined();
  });
});

describe("the address an address leads on to", () => {
  test("is the one of the start view for the root", () => {
    expect(leadsTo("/")).toBe(startView.path);
  });

  // Nothing but the root leads anywhere: an address of no view stays as
  // it was typed, for the not-found view to show.
  test.each(["/overview", "/nodes", "/Nodes", "/nodes/", "/no/such/view", ""])(
    "is %j itself",
    (address) => {
      expect(leadsTo(address)).toBe(address);
    },
  );
});

// The title is the first thing a screen reader says of a page, and what a
// tab and a bookmark are called. The view comes first: in a row of tabs
// cut short, "Jobs" is what tells one sdash tab from another.
test("the document title names the view before the application", () => {
  expect(documentTitle("Jobs")).toBe("Jobs - sdash");
});
