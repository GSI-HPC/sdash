// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

import { galleryPath, galleryTitle } from "../src/gallery/page.ts";
import { storageKey as sidebarKey } from "../src/layout/sidebar.ts";
import { views } from "../src/routing/views.ts";
import {
  heading,
  open,
  openAt,
  pressPaletteKeys,
  scan,
  settled,
  tabKey,
  tooltips,
  withStored,
} from "./support.ts";

// The automated part of the accessibility target, WCAG 2.1 AA: the axe
// scan of every view (doc/adr/0014-accessibility-and-browsers.md). Each is
// scanned in both themes, since contrast differs between them, and with the
// sidebar in both of its forms, since they have different content. The
// dialogs of the shell are states of every view and are scanned once each,
// over the Overview. The gallery, which shows every primitive at rest, is
// scanned with the views; its overlays and the other states of the
// primitives are in gallery.spec.ts. What a user with low vision changes
// about the page, its size and its colours, is in zoom-and-contrast.spec.ts.

const pages = [
  ...views.map((view) => ({ path: view.path, title: view.title })),
  { path: galleryPath, title: galleryTitle },
  { path: "/no/such/view", title: "Page not found" },
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`in the ${theme} theme`, () => {
    // Without a stored choice the page takes the theme the system prefers.
    test.use({ colorScheme: theme });

    for (const sidebar of ["expanded", "collapsed"] as const) {
      test.describe(`with the sidebar ${sidebar}`, () => {
        for (const { path, title } of pages) {
          test(`${path} passes the axe scan`, async ({ page }) => {
            await withStored(page, sidebarKey, sidebar);
            await openAt(page, path);
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              theme,
            );
            await expect(
              page.getByRole("button", {
                name:
                  sidebar === "collapsed"
                    ? "Expand sidebar"
                    : "Collapse sidebar",
              }),
            ).toBeVisible();
            await settled(page, title);

            expect(await scan(page)).toEqual([]);
          });
        }
      });
    }

    // Arrived at by the keyboard, a view has the focus on its heading and
    // the ring around it, which a page that was loaded does not show.
    test("a view arrived at by the keyboard passes the axe scan", async ({
      page,
    }) => {
      await open(page);
      await settled(page, "Overview");
      await page.keyboard.press("g");
      await page.keyboard.press("j");
      await expect(heading(page)).toBeFocused();

      expect(await scan(page)).toEqual([]);
    });

    // The skip link is seen only while it has the focus.
    test("the skip link showing passes the axe scan", async ({
      page,
      browserName,
    }) => {
      await open(page);
      await settled(page, "Overview");
      await page.keyboard.press(tabKey(browserName));
      await expect(
        page.getByRole("link", { name: "Skip to main content" }),
      ).toBeInViewport();

      expect(await scan(page)).toEqual([]);
    });

    // The name beside a rail item is content of its own, in colours of
    // its own: a tooltip, in the place the page has for popups.
    test("the rail with the name of a link showing passes the axe scan", async ({
      page,
      browserName,
    }) => {
      await withStored(page, sidebarKey, "collapsed");
      await open(page);
      await settled(page, "Overview");
      await page.getByRole("link", { name: "Overview" }).focus();
      await page.keyboard.press(tabKey(browserName));
      await expect(page.getByRole("link", { name: "Nodes" })).toBeFocused();
      // The one tooltip that shows, once the one of the link before has
      // gone: a list waits for that (tooltips in support.ts).
      await expect(tooltips(page)).toHaveText(["Nodes"]);

      expect(await scan(page)).toEqual([]);
    });

    // A link under the pointer has a look of its own, which no scan of a
    // page at rest sees. The not-found view has the one link of the shell
    // that is set in running text.
    test("a link under the pointer passes the axe scan", async ({ page }) => {
      await openAt(page, "/no/such/view");
      await settled(page, "Page not found");
      const link = page.getByRole("link", { name: "Go to the Overview" });
      await link.hover();
      await expect(link).toHaveCSS("text-decoration-line", "underline");

      expect(await scan(page)).toEqual([]);
    });

    // The report of a view that failed takes the place of the view, and
    // is a state with a look of its own: a heading with the focus on it
    // when it was arrived at, a text and a button.
    test("the report of a view that cannot be fetched passes the axe scan", async ({
      page,
    }) => {
      await open(page);
      await settled(page, "Overview");
      await page.route(/\/assets\/Nodes-[^/]+\.js$/, (route) => route.abort());
      await page.keyboard.press("g");
      await page.keyboard.press("n");
      await expect(heading(page)).toHaveText("This view did not load");
      await expect(heading(page)).toBeFocused();

      expect(await scan(page)).toEqual([]);
    });

    test("the cluster switcher with its explanation showing passes the axe scan", async ({
      page,
      browserName,
    }) => {
      await open(page);
      await settled(page, "Overview");
      await page.getByRole("link", { name: "Skip to main content" }).focus();
      await page.keyboard.press(tabKey(browserName));
      await expect(
        page.getByRole("button", { name: "Clusters" }),
      ).toBeFocused();
      await expect(page.getByRole("tooltip")).toBeVisible();

      expect(await scan(page)).toEqual([]);
    });

    test("the command palette passes the axe scan", async ({ page }) => {
      const problems = await open(page);
      await settled(page, "Overview");
      await pressPaletteKeys(page);
      await expect(page.getByRole("combobox")).toBeFocused();

      // As it opens, with everything listed.
      expect(await scan(page)).toEqual([]);

      // With a query, and the marker moved off the first entry.
      await page.getByRole("combobox").pressSequentially("s");
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
      expect(await scan(page)).toEqual([]);

      // With nothing found, which has a text of its own in place of the
      // list.
      await page.getByRole("combobox").pressSequentially("zzz");
      await expect(page.getByRole("status")).toHaveText(
        "No view or action matches.",
      );
      expect(await scan(page)).toEqual([]);

      // A dialog sets styles from its script; none of it may be refused
      // by the Content-Security-Policy.
      expect(problems).toEqual([]);
    });

    test("the keyboard help passes the axe scan", async ({ page }) => {
      const problems = await open(page);
      await settled(page, "Overview");
      await page.keyboard.press("?");
      const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
      await expect(help).toBeVisible();

      expect(await scan(page)).toEqual([]);

      // With the single-key shortcuts off, each of their lines says so.
      await help
        .getByRole("checkbox", { name: "Single-key shortcuts" })
        .uncheck();
      await expect(help.getByText("switched off").first()).toBeVisible();
      expect(await scan(page)).toEqual([]);

      expect(problems).toEqual([]);
    });
  });
}

test.describe("on a screen 360 px wide", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  // The narrow header has other content than the wide one: the search
  // button is its icon, the cluster switcher its light and its arrow.
  test("the shell passes the axe scan", async ({ page }) => {
    await open(page);
    await settled(page, "Overview");

    expect(await scan(page)).toEqual([]);
  });

  test("the command palette passes the axe scan", async ({ page }) => {
    await open(page);
    await settled(page, "Overview");
    await page
      .getByRole("button", { name: "Search views and actions" })
      .click();
    await expect(page.getByRole("combobox")).toBeFocused();

    expect(await scan(page)).toEqual([]);
  });
});
