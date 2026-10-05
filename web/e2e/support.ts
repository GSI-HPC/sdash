// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What every end-to-end test needs: a way into sdash, and the accessibility
// scan each view must pass (doc/adr/0014-accessibility-and-browsers.md).

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

import { isApplePlatform } from "../src/shortcuts/keys.ts";

/**
 * The address sdash printed when it started, with the token of its launch.
 */
function launchAddress(): URL {
  const address = process.env.SDASH_URL;
  if (!address) {
    throw new Error("SDASH_URL is not set; playwright.config.ts sets it");
  }
  return new URL(address);
}

/**
 * Loads the given address and returns what the browser reports as going
 * wrong from then on: uncaught errors, and what it writes to the console as
 * an error, which is where it reports what the Content-Security-Policy made
 * it refuse. The list keeps growing while the page lives.
 */
async function enter(
  page: Page,
  address: URL,
  until: "load" | "domcontentloaded",
): Promise<string[]> {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(message.text());
    }
  });

  const response = await page.goto(address.href, { waitUntil: until });
  // A binary compiled without the interface answers 404 with a page that
  // says so; without this check a test would fail on a missing element and
  // hide the reason.
  expect(response?.status(), await response?.text()).toBe(200);
  return problems;
}

/**
 * Opens sdash the way its user does, through the address it printed, token
 * included, and returns the list of what the browser reports as going wrong
 * from then on.
 *
 * `until` is the event of the page that is waited for. A test that holds
 * back a file of the interface says "domcontentloaded": whether a page
 * counts as loaded while a script it asked for is still on the way differs
 * from engine to engine.
 */
export async function open(
  page: Page,
  { until = "load" }: { until?: "load" | "domcontentloaded" } = {},
): Promise<string[]> {
  return enter(page, launchAddress(), until);
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

/**
 * Opens sdash at the given address of the application, as a link to a view
 * does: the server answers it with the page, and the page has to find its
 * way to the view from the address alone. Returns what open returns.
 *
 * The token of the launch travels with the address, which sdash takes at
 * any address, so the interface is loaded once. Loaded at the root first
 * and left at once for the address, the first page would still have a font,
 * the file of its view or a call of the API on the way, and Firefox and
 * WebKit write each request a navigation cuts off to the console as an
 * error: the test's doing, and no fault of the page.
 */
export async function openAt(page: Page, path: string): Promise<string[]> {
  const launch = launchAddress();
  const address = new URL(path, launch);
  for (const [name, value] of launch.searchParams) {
    address.searchParams.set(name, value);
  }
  return enter(page, address, "load");
}

/**
 * Reloads the page once nothing it asked for is still on the way, for the
 * reason openAt gives: a reload cuts off the requests in flight, and two of
 * the three engines report each as an error.
 */
export async function reload(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.reload();
}

/**
 * The sidebar, which is the navigation landmark of the page: the links to
 * the views and the button that collapses it.
 */
export function sidebar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Views" });
}

/**
 * The tooltips that show at this moment, of either kind. One that names
 * its control has no role to find it by and is not inside its control: it
 * lies where the popups of the page go. One that describes its control
 * stays on the page while it is closed, hidden, so that the description
 * can be read; that one is left out here.
 *
 * Where the focus has just come from a control with a tooltip of its own,
 * what they say is asked for with a list, toHaveText(["Nodes"]). Base UI
 * takes a tooltip that has closed off the page in the next animation frame
 * and not at once, so for a moment the page holds two, the one that goes
 * and the one that came; no frame is drawn with both, and nobody sees
 * them. A list is compared again until it matches, and so waits for the
 * first to go. Asked for a single text, Playwright fails at once on two
 * elements, and whether a frame has passed by then is up to how fast the
 * engine draws, not to the page.
 */
export function tooltips(page: Page): Locator {
  return page.locator('[data-slot="tooltip"]').filter({ visible: true });
}

/** The one level-one heading of the page, which names the view. */
export function heading(page: Page): Locator {
  return page.getByRole("heading", { level: 1 });
}

/**
 * Waits until the page shows the view of the given title in full, which is
 * what a scan should see. The Overview has a part that arrives with the
 * answer of the server.
 */
export async function settled(page: Page, title: string): Promise<void> {
  await expect(heading(page)).toHaveText(title);
  if (title === "Overview") {
    await expect(page.getByRole("status")).toContainText("Version");
  }
}

/**
 * Presses the shortcut of the command palette with the modifier the page
 * takes for its platform: the application asks the browser which it is, and
 * so does this, since an engine may report another platform than the one
 * the tests run on.
 */
export async function pressPaletteKeys(page: Page): Promise<void> {
  const apple = isApplePlatform(await page.evaluate(() => navigator.platform));
  await page.keyboard.press(apple ? "Meta+k" : "Control+k");
}

/**
 * Has the page start with a value in its localStorage, as a user's earlier
 * choice would be there. Call it before open.
 */
export async function withStored(
  page: Page,
  key: string,
  value: string,
): Promise<void> {
  await page.addInitScript(
    ([name, stored]) => {
      localStorage.setItem(name, stored);
    },
    [key, value] as const,
  );
}

/**
 * The key that moves the focus to the next control, for page.keyboard. It
 * is Tab, except in WebKit on a Mac: Safari there leaves links and buttons
 * out of the Tab key's order unless the user changed a setting, and reaches
 * them with Option and Tab. The tests are about what the focus does once it
 * moves, so they press whichever key moves it.
 */
export function tabKey(browserName: string): string {
  return browserName === "webkit" && process.platform === "darwin"
    ? "Alt+Tab"
    : "Tab";
}
