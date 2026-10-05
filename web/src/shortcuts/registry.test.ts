// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { parseBinding } from "./keys";
import { createRegistry, type Registry } from "./registry";
import type { Scope } from "./resolve";

// What the registry says about a registration, as opposed to what it does
// with a key (registry.browser.test.tsx, resolve.test.ts). Two shortcuts
// with the same keys in one scope are a mistake in the code: only the
// later one runs, and the help lists both.

/** Registers a shortcut that does nothing, described by its name. */
function register(
  registry: Registry,
  keys: string,
  scope: Scope,
  name: string,
): () => void {
  return registry.register({
    keys,
    binding: parseBinding(keys),
    scope,
    description: name,
    group: "Test",
    run: () => undefined,
  });
}

/** What was written to the console as an error, one text for each call. */
function reported(): string[] {
  return vi.mocked(console.error).mock.calls.map((call) => call.join(" "));
}

beforeEach(() => {
  // Kept from the output of the run: these reports are what is tested.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("in a development build", () => {
  test("a second shortcut with the keys of another in the same scope is reported, with both ids", () => {
    const registry = createRegistry(false);
    register(registry, "e", "view", "Expand every row");
    register(registry, "x", "view", "Something else");

    register(registry, "e", "view", "Edit the row");

    const [first, , second] = registry.listed();
    expect(reported()).toHaveLength(1);
    const [report = ""] = reported();
    expect(report).toContain('"e"');
    expect(report).toContain('"view"');
    expect(report).toContain(
      `the id ${String(first?.id)} ("Expand every row")`,
    );
    expect(report).toContain(`the id ${String(second?.id)} ("Edit the row")`);
  });

  test("a sequence registered twice is reported as well", () => {
    const registry = createRegistry(false);
    register(registry, "g o", "global", "Overview");

    register(registry, "g o", "global", "Options");

    expect(reported()).toHaveLength(1);
  });

  // A view may give a key of the shell a meaning of its own, and a dialog
  // one of the view's: that is what the scopes are for.
  test("the same keys in another scope are not reported", () => {
    const registry = createRegistry(false);
    register(registry, "t", "global", "Switch the theme");

    register(registry, "t", "view", "Show the tree");
    register(registry, "t", "overlay", "Tick the box");

    expect(reported()).toEqual([]);
  });

  test.each([
    ["k", "mod+k"],
    ["g", "g o"],
    ["g o", "g n"],
    ["Escape", "Enter"],
  ])("%j and %j are different keys and not reported", (one, other) => {
    const registry = createRegistry(false);
    register(registry, one, "global", "One");

    register(registry, other, "global", "Other");

    expect(reported()).toEqual([]);
  });

  // A component registers anew when what the help shows of it changes, and
  // React mounts every component twice while developing. Neither is a
  // second shortcut: the first registration is gone before the next comes.
  test("a shortcut that is registered again after it was taken out is not reported", () => {
    const registry = createRegistry(false);
    const remove = register(registry, "e", "view", "Expand every row");

    remove();
    register(registry, "e", "view", "Collapse every row");

    expect(reported()).toEqual([]);
  });

  // The report is all that happens: both stay registered, and the later
  // one runs, as the rules say (resolve.ts).
  test("the shortcut is registered all the same", () => {
    const registry = createRegistry(false);
    register(registry, "e", "view", "Expand every row");

    expect(() => register(registry, "e", "view", "Edit the row")).not.toThrow();

    expect(registry.listed().map((listed) => listed.description)).toEqual([
      "Expand every row",
      "Edit the row",
    ]);
  });
});

// The build the binary embeds has the report compiled out. A user's page
// neither writes to the console nor stops over a mistake of the code that
// costs them one shortcut.
describe("in a build for users", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
  });

  test("a second shortcut with the same keys is neither reported nor refused", () => {
    const registry = createRegistry(false);
    register(registry, "e", "view", "Expand every row");

    expect(() => register(registry, "e", "view", "Edit the row")).not.toThrow();

    expect(reported()).toEqual([]);
    expect(registry.listed()).toHaveLength(2);
  });
});
