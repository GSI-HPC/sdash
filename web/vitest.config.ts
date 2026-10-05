// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

// A Chromium to use in place of the one Playwright installs, for a machine
// where "npx playwright install" is not wanted or does not work. Unset, as
// in CI, Playwright's own build is used, which for a run without a window
// is the headless shell. A Chromium named here is the whole browser run
// without a window: the two can differ in what is around the page, such as
// where the focus goes once the Tab key leaves it (doc/testing.md).
const chromium = process.env.SDASH_CHROMIUM;

// Two of the three test layers of doc/adr/0015-how-tests-are-written.md; the
// third, end to end against the binary, is playwright.config.ts. A file name
// decides the layer: *.browser.test.tsx is a component test, any other
// *.test.ts a unit test. Both layers are built with the application's own
// Vite configuration, so a test sees the code as the browser will.
export default mergeConfig(
  viteConfig,
  defineConfig({
    // vite.config.ts fixes the port of the dev server, the one port
    // "sdash --dev" accepts it on. The server of the component tests
    // inherits that setting and must not keep it: two runs on one machine,
    // in two worktrees or by two agents, would have the second fail on a
    // port in use where it can take the next one.
    server: { strictPort: false },
    test: {
      // Where the screenshot of a failed component test goes: under
      // test-results/, which git ignores and CI can keep as an artefact, in
      // place of Vitest's own directory.
      attachmentsDir: "test-results/vitest",
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "node",
            include: ["src/**/*.test.{ts,tsx}"],
            exclude: ["src/**/*.browser.test.{ts,tsx}"],
            // Vitest hands a test in Node an empty file for every stylesheet
            // it imports, the "?raw" text included, unless told to process
            // them. The token test reads styles/tokens.css and would
            // otherwise compare the prototype with nothing.
            css: true,
          },
        },
        {
          extends: true,
          test: {
            name: "components",
            include: ["src/**/*.browser.test.{ts,tsx}"],
            browser: {
              enabled: true,
              provider: playwright({
                launchOptions: chromium ? { executablePath: chromium } : {},
              }),
              // Chromium only: a component is checked for what it does, and
              // the engines are compared by the end-to-end layer.
              instances: [{ browser: "chromium" }],
              // Without a window everywhere, not only where CI is set, so a
              // run on a developer's machine with Playwright's own build is
              // the run CI does.
              headless: true,
              // A screenshot a test takes itself goes there as well, and
              // not next to the test file.
              screenshotDirectory: "test-results/vitest/screenshots",
            },
          },
        },
      ],
    },
  }),
);
