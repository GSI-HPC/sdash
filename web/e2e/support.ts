// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What every end-to-end test needs: a way into sdash, and the accessibility
// scan each view must pass (doc/adr/0014-accessibility-and-browsers.md).

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Opens sdash the way its user does, through the address it printed, token
 * included, and returns what the browser reports as going wrong from then
 * on: uncaught errors, and what it writes to the console as an error, which
 * is where it reports what the Content-Security-Policy made it refuse. The
 * list keeps growing while the page lives.
 */
export async function open(page: Page): Promise<string[]> {
  const address = process.env.SDASH_URL;
  if (!address) {
    throw new Error("SDASH_URL is not set; playwright.config.ts sets it");
  }

  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(message.text());
    }
  });

  const response = await page.goto(address);
  // A binary compiled without the interface answers 404 with a page that
  // says so; without this check a test would fail on a missing element and
  // hide the reason.
  expect(response?.status(), await response?.text()).toBe(200);
  return problems;
}

/**
 * Scans the page with axe and returns the violations; a view passes with
 * none. It runs every rule axe enables by default, on the whole page: no
 * rule is switched off and no element left out, so that an exception has to
 * be made here, in one place, where it is seen and has to give its reason.
 */
export async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations;
}
