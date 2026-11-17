// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The views in a browser against the slurmrestd of the seeded sind cluster
// itself, and not against the fake of playwright.config.ts, which answers
// with captures of it (doc/adr/0016-e2e-and-fixtures-on-sind.md). e2e/browser.sh
// writes the profile file and runs this; the browser tests of every engine
// stay with the fake, so one engine is enough here.

const binary = "../bin/sdash";
const profile = process.env.SDASH_PROFILE;

// A missing binary or profile file is an error and not a reason to skip: a
// suite that passes by running nothing would be read as a green one.
if (!existsSync(path.resolve(import.meta.dirname, binary))) {
  throw new Error(`${binary} does not exist: build it with "make build"`);
}
if (!profile) {
  throw new Error(
    'SDASH_PROFILE is not set: run "make e2e-browser", which writes it',
  );
}

const gracefulShutdown = { signal: "SIGTERM", timeout: 10_000 } as const;

export default defineConfig({
  testDir: "e2e/sind",
  // Apart from the browser tests' own, so that one run does not clear what
  // the other left, and kept as an artefact by CI with the screenshots.
  outputDir: "test-results/sind",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report/sind" }],
      ]
    : "list",
  // A live cluster answers slower than the fake, and the first answer of
  // each kind waits for slurmrestd.
  expect: { timeout: 15_000 },
  use: { trace: "retain-on-failure" },
  // The main region scrolls inside the window, so a screenshot of the full
  // page holds only what the window shows: a tall window holds each view
  // whole.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1600 },
      },
    },
  ],
  webServer: {
    command: `${binary} --no-browser --listen localhost:0 --config "${profile}"`,
    // The name support.ts reads for the sdash with a cluster.
    wait: { stdout: /sdash is serving at (?<sdash_cluster_url>\S+)/ },
    gracefulShutdown,
  },
});
