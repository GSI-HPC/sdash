// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

import { galleryPath, galleryTitle } from "../src/gallery/page.ts";
import { storageKey as sidebarKey } from "../src/layout/sidebar.ts";
import { groups, views } from "../src/routing/views.ts";
import {
  heading,
  open,
  openAt,
  sidebar,
  tabKey,
  withStored,
} from "./support.ts";

// What every address of the application shows, whichever view it names:
// the shell (doc/ui.md). The tests of what the shell does are in
// navigation.spec.ts and keyboard.spec.ts, the scans in
// accessibility.spec.ts.

// The addresses to try: every view of the view table, the gallery of the
// primitives, which is a page like a view and no view, and one that
// neither has, which shows the not-found view inside the same shell.
const pages = [
  ...views.map((view) => ({ path: view.path, title: view.title })),
  { path: galleryPath, title: galleryTitle },
  { path: "/no/such/view", title: "Page not found" },
];

for (const { path, title } of pages) {
  // The server answers every address with the same page, so that a reload
  // of a view, or a link to one, works; the page then has to show the view
  // of that address. A screen reader user finds their way by the three
  // landmarks of the shell and learns what the page is from its one
  // top-level heading and from the title of the document.
  test(`${path} loads inside the shell, with one heading and the landmarks`, async ({
    page,
  }) => {
    const problems = await openAt(page, path);

    await expect(heading(page)).toHaveCount(1);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toHaveText(title);
    await expect(page).toHaveTitle(`${title} - sdash`);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Views" })).toHaveCount(
      1,
    );
    await expect(page.getByRole("main")).toHaveCount(1);
    // And no fourth of the shell's: the sidebar is the navigation, with
    // no landmark of its own around it.
    await expect(page.getByRole("navigation")).toHaveCount(1);
    await expect(page.getByRole("complementary")).toHaveCount(0);
    // The region the toasts appear in is a landmark beside them, on the
    // page from the start: a region that announces has to be there before
    // what it announces.
    await expect(
      page.getByRole("region", { name: "Notifications" }),
    ).toHaveCount(1);
    // A page that was loaded leaves the focus at its top. The title above
    // is set in the step in which a heading would take the focus, so with
    // the title there, the focus has been left alone and not just not
    // been moved yet.
    await expect(page.locator("body")).toBeFocused();

    // Nothing was refused by the Content-Security-Policy, and nothing
    // threw.
    expect(problems).toEqual([]);
  });
}

// A view has one address, and the server answers every address with the
// application, so it is the application that has to tell them apart. A
// router left to itself reads all three of these as "/nodes". Each is the
// address of no view: the not-found view shows, the address stays as it
// was typed, and the navigation marks no view as the one that shows.
for (const address of ["/nodes/r07", "/Nodes", "/nodes/"]) {
  test(`${address} is the address of no view and marks none in the navigation`, async ({
    page,
  }) => {
    const problems = await openAt(page, address);

    await expect(heading(page)).toHaveText("Page not found");
    await expect(page).toHaveTitle("Page not found - sdash");
    await expect(
      page.getByRole("main").getByText(address, { exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(address);
    await expect(sidebar(page).locator("[aria-current]")).toHaveCount(0);

    // The navigation leads from there to the view that was meant.
    await sidebar(page).getByRole("link", { name: "Nodes" }).click();
    await expect(heading(page)).toHaveText("Nodes");
    await expect(page).toHaveURL(/\/nodes$/);
    await expect(sidebar(page).locator("[aria-current]")).toHaveText("Nodes");
    expect(problems).toEqual([]);
  });
}

// A screen reader says the name of a list on entering it. The label of a
// group gives its list that name, and is not read as a text of its own
// before it as well, in neither form of the sidebar.
for (const form of ["expanded", "collapsed"] as const) {
  test(`a group of the navigation is read once, as the name of its list, with the sidebar ${form}`, async ({
    page,
  }) => {
    await withStored(page, sidebarKey, form);
    await open(page);
    await expect(heading(page)).toBeVisible();

    // What assistive technology is given of the sidebar, as text.
    const tree = await sidebar(page).ariaSnapshot();
    for (const group of groups) {
      expect(tree).toContain(`- list "${group}":`);
      expect(tree.split(group), group).toHaveLength(2);
    }
  });
}

test("the root address leads to the Overview", async ({ page }) => {
  const problems = await open(page);

  await expect(heading(page)).toHaveText("Overview");
  await expect(page).toHaveURL(/\/overview$/);
  expect(problems).toEqual([]);
});

// The server allows no inline script, no inline style and no other host
// (doc/adr/0012-local-listener-security.md). A build that needed one of
// them would work under "npm run dev" and break in the binary, so this is
// checked where the policy is in force.
test("the built interface runs under the server's Content-Security-Policy", async ({
  page,
}) => {
  const problems = await open(page);
  await expect(heading(page)).toBeVisible();

  // The script ran: it sets the theme.
  await expect(page.locator("html")).toHaveAttribute("data-theme", /./);
  // The stylesheet applies: the heading is set in the design's font.
  await expect(heading(page)).toHaveCSS("font-family", /DM Sans Variable/);
  // The fonts load from the server itself: a face of each family is in use
  // on this page, and none failed.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(({ family, status }) => ({
      // A browser may report the family with or without its quotes.
      family: family.replaceAll('"', ""),
      status,
    }));
  });
  expect(fonts).toContainEqual({
    family: "DM Sans Variable",
    status: "loaded",
  });
  expect(fonts).toContainEqual({ family: "DM Mono", status: "loaded" });
  expect(fonts.filter(({ status }) => status === "error")).toEqual([]);

  expect(problems).toEqual([]);
});

// The page has to name its script and its stylesheet from the root: named
// relative to the address, they would be asked for below it, where the
// server has only the page itself to give. An address two levels down has
// no view; the not-found view shows that the application came up there.
test("the interface loads at an address below the root", async ({ page }) => {
  const problems = await openAt(page, "/jobs/4711");

  await expect(heading(page)).toHaveText("Page not found");
  await expect(heading(page)).toHaveCSS("font-family", /DM Sans Variable/);
  await expect(page.getByRole("main").getByText("/jobs/4711")).toBeVisible();
  expect(problems).toEqual([]);
});

// The sizes of the design handoff (doc/design/README.md, "Global
// layout"), in the binary's own stylesheet and at the default font size.
test("the header and the sidebar have the handoff's sizes", async ({
  page,
}) => {
  await open(page);
  await expect(heading(page)).toBeVisible();

  await expect(page.getByRole("banner")).toHaveCSS("height", "52px");
  await expect(sidebar(page)).toHaveCSS("width", "224px");
  const main = page.getByRole("main");
  await expect(main).toHaveCSS("padding-top", "20px");
  await expect(main).toHaveCSS("padding-right", "24px");
  await expect(main).toHaveCSS("padding-bottom", "48px");
  await expect(main).toHaveCSS("padding-left", "24px");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar(page)).toHaveCSS("width", "60px");
});

// The handoff asks for motion to respect the system's setting. The width
// of the sidebar is the one thing the shell animates.
test.describe("with reduced motion asked for", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the width of the sidebar is not animated", async ({ page }) => {
    await open(page);
    const body = sidebar(page).locator("xpath=..");

    await expect(body).toHaveCSS("transition-property", "none");
  });
});

test("the sidebar moves with the handoff's easing otherwise", async ({
  page,
}) => {
  await open(page);
  const body = sidebar(page).locator("xpath=..");

  await expect(body).toHaveCSS("transition-property", "grid-template-columns");
  await expect(body).toHaveCSS("transition-duration", "0.3s");
  await expect(body).toHaveCSS(
    "transition-timing-function",
    "cubic-bezier(0.32, 0.72, 0, 1)",
  );
});

// 360 px is the narrowest screen the layout is drawn for. 320 px is the
// width WCAG 2.1 measures reflow at (success criterion 1.4.10): a page
// enlarged to four times its size in a window 1280 px wide.
for (const width of [360, 320]) {
  test.describe(`on a screen ${String(width)} px wide`, () => {
    test.use({ viewport: { width, height: 740 } });

    for (const { path, title } of pages) {
      // A page wider than the screen scrolls sideways, and what is off to
      // the right is not found.
      test(`${path} fits without scrolling sideways`, async ({ page }) => {
        const problems = await openAt(page, path);
        await expect(heading(page)).toHaveText(title);

        // The shell clips what is too wide for it and the main region
        // scrolls, so a view that is too wide shows as a main region that
        // scrolls sideways and never as a page that does. Both are asked.
        // The window itself does not scroll down either: the shell is as
        // high as the window, and what is taken out of the flow far down
        // a region that scrolls, a name kept for assistive technology,
        // must not be held by the page, which would grow by it.
        const beyond = await page.evaluate(() => {
          const root = document.documentElement;
          const main = document.querySelector("main");
          return {
            page: root.scrollWidth - root.clientWidth,
            main: main ? main.scrollWidth - main.clientWidth : NaN,
            down: root.scrollHeight - root.clientHeight,
          };
        });
        expect(beyond).toEqual({ page: 0, main: 0, down: 0 });
        // The sidebar is the rail, and the header's controls are all on
        // the screen.
        await expect(sidebar(page)).toHaveCSS("width", "60px");
        for (const control of await page
          .getByRole("banner")
          .getByRole("button")
          .all()) {
          await expect(control).toBeInViewport({ ratio: 1 });
        }
        expect(problems).toEqual([]);
      });
    }

    // The reason below the cluster switcher is all a sighted user learns
    // about the button. It starts at the button, and is moved left by a
    // script where it would run off the screen: under the server's
    // Content-Security-Policy too.
    test("the reason below the cluster switcher is on the screen in full", async ({
      page,
      browserName,
    }) => {
      const problems = await open(page);
      await expect(heading(page)).toBeVisible();

      await page.getByRole("link", { name: "Skip to main content" }).focus();
      await page.keyboard.press(tabKey(browserName));
      await expect(
        page.getByRole("button", { name: "Clusters" }),
      ).toBeFocused();

      const reason = page
        .getByRole("tooltip")
        .getByText("No cluster is configured yet");
      await expect(reason).toBeVisible();
      await expect(reason).toBeInViewport({ ratio: 1 });
      expect(problems).toEqual([]);
    });
  });
}
