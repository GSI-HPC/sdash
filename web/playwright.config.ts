// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The end-to-end tests: a browser against the built binary, with the axe
// scan of every view (doc/adr/0015-how-tests-are-written.md,
// doc/adr/0014-accessibility-and-browsers.md).

// What "make build" produces, seen from this file's directory, which is
// where Playwright runs the command below.
const binary = "../bin/sdash";

// A Chromium to use in place of the one Playwright installs, for a machine
// where "npx playwright install" is not wanted or does not work. Unset, as
// in CI, Playwright's own build is used.
const chromium = process.env.SDASH_CHROMIUM;

// The address of the sdash under test, with the token of its launch, as
// sdash prints it when it starts. Whoever starts sdash before the tests
// sets it. Otherwise the tests start sdash themselves, below, and it is set
// from what that sdash prints; the test workers start afterwards, read this
// file again and find it set.
const address = process.env.SDASH_URL;

// A missing binary is an error and not a reason to skip: a suite that
// passes by running nothing would be read as a green one.
if (!address && !existsSync(path.resolve(import.meta.dirname, binary))) {
  throw new Error(
    `${binary} does not exist: build it with "make build" in the root of ` +
      "the checkout, or start sdash yourself and set SDASH_URL to the " +
      "address it prints",
  );
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // A test.only left in by mistake would turn CI into a run of one test.
  forbidOnly: Boolean(process.env.CI),
  // CI keeps the report as an artefact; a terminal wants the list alone.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    ...(address ? { baseURL: address } : {}),
    trace: "retain-on-failure",
  },

  // The three engines behind the supported browsers. Playwright's WebKit
  // stands in for Safari and its Firefox for the ESR as well
  // (doc/adr/0014-accessibility-and-browsers.md).
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  ...(address
    ? {}
    : {
        webServer: {
          // localhost binds both loopback addresses, as sdash does by
          // default. Port 0 has the system pick a free one, so a run does
          // not collide with a sdash the developer has open, or with a
          // second run. No browser is opened: the tests bring their own.
          // The cluster profiles are the tests' own, none so far, and not
          // those of whoever runs them (doc/profiles.md).
          command: `${binary} --no-browser --listen localhost:0 --config e2e/profiles`,
          // sdash is up once it has printed its address. The named group
          // becomes the environment variable SDASH_URL.
          wait: { stdout: /sdash is serving at (?<sdash_url>\S+)/ },
          // SIGTERM is how sdash is stopped in an orderly way; the default
          // would kill it. The time is longer than sdash gives its requests
          // in flight, so a kill here means a shutdown that hangs.
          gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
        },
      }),
});
