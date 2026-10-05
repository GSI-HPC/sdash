// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { isLoadFailure } from "./loadFailure";

describe("an error from loading a view", () => {
  // What each engine throws when the file of a lazily loaded view cannot
  // be fetched: sdash was stopped, or replaced by a build whose files have
  // other names.
  test.each([
    {
      engine: "Chromium",
      message:
        "Failed to fetch dynamically imported module: http://127.0.0.1:7374/assets/Nodes-C3kq0vXw.js",
    },
    {
      engine: "Firefox",
      message:
        "error loading dynamically imported module: http://127.0.0.1:7374/assets/Nodes-C3kq0vXw.js",
    },
    { engine: "WebKit", message: "Importing a module script failed." },
  ])("is a failed load as $engine words it", ({ message }) => {
    expect(isLoadFailure(new TypeError(message))).toBe(true);
  });

  // A view that was loaded and then broke is a defect of the view. Telling
  // its user that sdash was stopped would send them after the wrong cause.
  test.each([
    {
      what: "a TypeError of the view's own",
      error: new TypeError(
        "Cannot read properties of undefined (reading 'nodes')",
      ),
    },
    {
      what: "an error that only mentions a module",
      error: new Error("Failed to fetch dynamically imported module"),
    },
    {
      what: "a failed request for data",
      error: new TypeError("Failed to fetch"),
    },
    { what: "something thrown that is no error", error: "module script" },
    { what: "nothing", error: undefined },
  ])("is not one for $what", ({ error }) => {
    expect(isLoadFailure(error)).toBe(false);
  });
});
