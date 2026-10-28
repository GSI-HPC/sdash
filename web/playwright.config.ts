// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The end-to-end tests: a browser against the built binary, with the axe
// scan of every view (doc/adr/0015-how-tests-are-written.md,
// doc/adr/0014-accessibility-and-browsers.md).

// What "make build" and "make slurmrestdtest" produce, seen from this
// file's directory, which is where Playwright runs the commands below.
const binary = "../bin/sdash";
const fake = "../bin/slurmrestdtest";

// A Chromium to use in place of the one Playwright installs, for a machine
// where "npx playwright install" is not wanted or does not work. Unset, as
// in CI, Playwright's own build is used.
const chromium = process.env.SDASH_CHROMIUM;

// The addresses of the two sdash under test, with the token of each
// launch, as sdash prints it when it starts: SDASH_URL of one without a
// cluster, SDASH_CLUSTER_URL of one whose profile file names the cluster of
// the fake slurmrestd. Whoever starts both before the tests sets both.
// Otherwise the tests start them themselves, below, and they are set from
// what each prints; the test workers start afterwards, read this file again
// and find them set.
const address = process.env.SDASH_URL;

// A missing binary is an error and not a reason to skip: a suite that
// passes by running nothing would be read as a green one.
for (const built of address ? [] : [binary, fake]) {
  if (!existsSync(path.resolve(import.meta.dirname, built))) {
    throw new Error(
      `${built} does not exist: build it with "make build slurmrestdtest" ` +
        "in the root of the checkout, or start sdash yourself and set " +
        "SDASH_URL and SDASH_CLUSTER_URL to the addresses it prints",
    );
  }
}

// SIGTERM is how sdash and the fake are stopped in an orderly way; the
// default would kill them, and the fake would leave its profile file. The
// time is longer than sdash gives its requests in flight, so a kill here
// means a shutdown that hangs.
const gracefulShutdown = { signal: "SIGTERM", timeout: 10_000 } as const;

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
        // Started one after the other, in this order: the third reads what
        // the second printed.
        webServer: [
          {
            // localhost binds both loopback addresses, as sdash does by
            // default. Port 0 has the system pick a free one, so a run
            // does not collide with a sdash the developer has open, or
            // with a second run. No browser is opened: the tests bring
            // their own.
            command: `${binary} --no-browser --listen localhost:0`,
            // sdash is up once it has printed its address. The named
            // group becomes the environment variable SDASH_URL.
            wait: { stdout: /sdash is serving at (?<sdash_url>\S+)/ },
            gracefulShutdown,
          },
          {
            // The fake answers with the captures of a sind cluster, and
            // writes a profile file that names it as the cluster "virgo"
            // (internal/slurm/slurmrestdtest).
            command: fake,
            wait: {
              stdout: /with the profile file (?<sdash_profile>\S+)/,
            },
            gracefulShutdown,
          },
          {
            // The shell that runs the command reads the path of the
            // profile file from the environment the fake's line set.
            command: `${binary} --no-browser --listen localhost:0 --config "$SDASH_PROFILE"`,
            wait: { stdout: /sdash is serving at (?<sdash_cluster_url>\S+)/ },
            gracefulShutdown,
          },
        ],
      }),
});
