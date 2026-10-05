// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

import { storageKey as sidebarKey } from "../src/layout/sidebar.ts";
import {
  open,
  openAt,
  pressPaletteKeys,
  scan,
  settled,
  sidebar,
  tabKey,
  withStored,
} from "./support.ts";

// What a user with low vision changes about the page, and what the shell
// has to do then (doc/adr/0014-accessibility-and-browsers.md): the page
// enlarged, which leaves the content a small window (WCAG 2.1, success
// criteria 1.4.4 and 1.4.10), and the colours replaced by a contrast theme
// of the system. The scans of the page as it comes are in
// accessibility.spec.ts.

// A window too low for the view, as a page enlarged to four times its size
// leaves it: the reflow that WCAG 2.1 asks for is measured at 320 by 256
// pixels (success criterion 1.4.10). The main region then scrolls, and a
// region that scrolls has rules of its own.
for (const viewport of [
  { width: 1280, height: 220 },
  { width: 320, height: 256 },
]) {
  test.describe(`in a window ${String(viewport.width)} by ${String(viewport.height)}`, () => {
    test.use({ viewport });

    test("the shell passes the axe scan", async ({ page }) => {
      await open(page);
      await settled(page, "Overview");
      const main = page.getByRole("main");
      await expect(main).toHaveAttribute("tabindex", "0");

      expect(await scan(page)).toEqual([]);
    });

    // WCAG 2.1, success criterion 2.1.1: the placeholder views hold
    // nothing that takes the focus, and their end still has to be reached
    // without a pointer.
    test("the main region is reached by the Tab key and scrolled by the keyboard", async ({
      page,
      browserName,
    }) => {
      await openAt(page, "/nodes");
      await settled(page, "Nodes");
      const main = page.getByRole("main");
      await expect(main).toHaveAttribute("tabindex", "0");

      // From the last control before it in the page: the button that
      // collapses the sidebar, or the last link where there is no such
      // button.
      await sidebar(page).locator("a, button").last().focus();
      await page.keyboard.press(tabKey(browserName));
      await expect(main).toBeFocused();
      await page.keyboard.press("End");

      await expect
        .poll(() => main.evaluate((region) => region.scrollTop))
        .toBeGreaterThan(0);
    });
  });
}

// A window too low for the command palette: a page enlarged to twice its
// size on a laptop (640 by 360), and the 320 by 256 of the reflow
// criterion. The palette is fixed to the window, so nothing scrolls to a
// part of it that is past the bottom edge: it has to fit, and its list has
// to scroll inside it (WCAG 2.1, success criteria 1.4.4 and 1.4.10).
for (const viewport of [
  { width: 640, height: 360 },
  { width: 320, height: 256 },
  { width: 1280, height: 220 },
]) {
  test.describe(`in a window ${String(viewport.width)} by ${String(viewport.height)}`, () => {
    test.use({ viewport });

    test("the command palette fits, and its marker stays in sight to the end of the list", async ({
      page,
    }) => {
      const problems = await open(page);
      await settled(page, "Overview");
      await pressPaletteKeys(page);
      await expect(page.getByRole("combobox")).toBeFocused();
      await expect(page.getByRole("dialog")).toBeInViewport({ ratio: 1 });

      const marked = page.getByRole("option", { selected: true });
      await page.keyboard.press("End");
      await expect(marked).toHaveText(/single-key shortcuts/);
      await expect(marked).toBeInViewport({ ratio: 1 });

      // One entry at a time, as a user reads down the list.
      await page.keyboard.press("Home");
      const entries = await page.getByRole("option").count();
      for (let entry = 1; entry < entries; entry++) {
        await page.keyboard.press("ArrowDown");
        await expect(marked).toBeInViewport({ ratio: 1 });
      }
      await expect(marked).toHaveText(/single-key shortcuts/);

      expect(await scan(page)).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}

// A contrast theme of the system, which Windows has and Edge and Firefox
// honour, replaces every background and every colour of the page with its
// own few. What the shell says by a background alone is then not said:
// which entry of the palette Enter will choose, which view shows.
test.describe("with the colours forced by the system", () => {
  test.use({ forcedColors: "active" });
  // Safari has no forced colours, and Playwright cannot make WebKit behave
  // as if it had: there is nothing to test there, in the tests or in use.
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit does not implement forced colours",
  );

  test("the marked entry of the command palette has an outline", async ({
    page,
  }) => {
    await open(page);
    await settled(page, "Overview");
    await pressPaletteKeys(page);
    await expect(page.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("ArrowDown");

    const marked = page.getByRole("option", { selected: true });
    await expect(marked).toHaveText(/^Nodes/);
    await expect(marked).toHaveCSS("outline-style", "solid");
    await expect(marked).toHaveCSS("outline-width", "2px");
    await expect(
      page.getByRole("option", { selected: false }).first(),
    ).toHaveCSS("outline-style", "none");
  });

  for (const sidebar of ["expanded", "collapsed"] as const) {
    // A border and not an outline: the outline is the ring of the keyboard
    // focus, which the link of the current view shows like any other.
    test(`the link of the view that shows has a border, with the sidebar ${sidebar}`, async ({
      page,
      browserName,
    }) => {
      await withStored(page, sidebarKey, sidebar);
      await openAt(page, "/nodes");
      await settled(page, "Nodes");

      const current = page.getByRole("link", { name: "Nodes" });
      await expect(current).toHaveAttribute("aria-current", "page");
      await expect(current).toHaveCSS("border-top-style", "solid");
      await expect(current).toHaveCSS("border-top-width", "2px");
      const other = page.getByRole("link", { name: "Partitions" });
      await expect(other).toHaveCSS("border-top-width", "0px");

      await page.getByRole("link", { name: "Overview" }).focus();
      await page.keyboard.press(tabKey(browserName));
      await expect(current).toBeFocused();
      await expect(current).toHaveCSS("outline-style", "solid");
      await expect(current).toHaveCSS("outline-offset", "2px");
      await expect(current).toHaveCSS("border-top-width", "2px");
    });
  }
});
