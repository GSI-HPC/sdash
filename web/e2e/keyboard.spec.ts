// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

import { storageKey as sidebarKey } from "../src/layout/sidebar.ts";
import { views } from "../src/routing/views.ts";
import {
  heading,
  open,
  pressPaletteKeys,
  reload,
  sidebar,
  tabKey,
  tooltips,
  withStored,
} from "./support.ts";

// The shell's shortcuts other than the ones that go to a view, and the
// preferences that have to be there again after a reload, which only a
// real page with a real store can show
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).

test("the key t switches the theme, and the choice outlives a reload", async ({
  page,
}) => {
  const problems = await open(page);
  await expect(heading(page)).toBeVisible();
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  const after = before === "dark" ? "light" : "dark";

  await page.keyboard.press("t");
  await expect(html).toHaveAttribute("data-theme", after);
  await expect(
    page.getByRole("button", { name: "Dark theme" }),
  ).toHaveAttribute("aria-pressed", String(after === "dark"));

  await reload(page);
  await expect(html).toHaveAttribute("data-theme", after);
  expect(problems).toEqual([]);
});

test("the key [ collapses the sidebar, and the choice outlives a reload", async ({
  page,
}) => {
  const problems = await open(page);
  await expect(heading(page)).toBeVisible();

  await page.keyboard.press("[");
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await expect(sidebar(page)).toHaveCSS("width", "60px");

  await reload(page);
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await expect(sidebar(page)).toHaveCSS("width", "60px");
  // Every view is still reached by its name.
  for (const view of views) {
    await expect(
      page.getByRole("link", { name: view.title, exact: true }),
    ).toHaveCount(1);
  }
  expect(problems).toEqual([]);
});

// The name of a rail item is a tooltip, which Base UI places from a
// script, through the style of its element. The server's
// Content-Security-Policy lets a script do that and forbids the same in
// the markup (doc/adr/0012-local-listener-security.md), so it is checked
// here, where the policy is in force, that the name arrives where it
// belongs.
test("the rail shows the name of a link beside it, under the server's policy", async ({
  page,
  browserName,
}) => {
  await withStored(page, sidebarKey, "collapsed");
  const problems = await open(page);
  const link = page.getByRole("link", { name: "Reservations" });
  // The tooltip is not inside its link: it is where the popups of the
  // page go, and hidden from assistive technology, which has the name of
  // the link already.
  const label = tooltips(page);

  await page.getByRole("link", { name: "Partitions" }).focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(link).toBeFocused();
  // A list, which waits for the name of the link before to go (tooltips in
  // support.ts).
  await expect(label).toHaveText(["Reservations"]);
  await expect(label).toBeVisible();

  const owner = await link.boundingBox();
  const icon = await link.locator("svg").boundingBox();
  const shown = await label.boundingBox();
  if (!owner || !icon || !shown) {
    throw new Error("the link or its label has no place on the page");
  }
  // To the right of the link, level with the icon.
  expect(shown.x).toBeGreaterThanOrEqual(owner.x + owner.width);
  expect(
    Math.abs(shown.y + shown.height / 2 - (icon.y + icon.height / 2)),
  ).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(label).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("the key ? lists the shortcuts, and Escape gives the focus back", async ({
  page,
}) => {
  const problems = await open(page);
  const link = page.getByRole("link", { name: "Job history" });
  await link.focus();

  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await expect(help.getByRole("term")).toHaveCount(views.length + 6);
  // The page behind the dialog does not act on keys meanwhile: "g" and
  // "n" go nowhere. That nothing came of them is asked once Escape, which
  // was pressed after them, has been seen to act. Asked at once, it would
  // hold of any page that has not got to the keys yet.
  await page.keyboard.press("g");
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);

  // Had the keys left the view, the focus would be on the heading of the
  // next one and not back on the link.
  await expect(link).toBeFocused();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(heading(page)).toHaveText("Overview");
  expect(problems).toEqual([]);
});

// Escape and the next key at once, as a user in a hurry types them. The
// page's keys are its own again when the dialog is closed, not when the
// last of it has left the page a moment later.
test("a key pressed right after Escape closed a dialog is the page's", async ({
  page,
}) => {
  const problems = await open(page);
  await expect(heading(page)).toHaveText("Overview");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });

  // Several times: the moment in question is a few milliseconds long.
  for (let round = 0; round < 5; round++) {
    await pressPaletteKeys(page);
    await expect(page.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});

// WCAG 2.1, success criterion 2.1.4: the shortcuts typed with character
// keys alone can be switched off. With them off the palette and Escape
// still work, and the palette is the way to everything else, the switch
// included.
test("the single-key shortcuts can be switched off, which outlives a reload, and on again", async ({
  page,
  browserName,
}) => {
  const problems = await open(page);
  await expect(heading(page)).toHaveText("Overview");
  const html = page.locator("html");
  const theme = await html.getAttribute("data-theme");

  await page.keyboard.press("?");
  await page.getByRole("checkbox", { name: "Single-key shortcuts" }).uncheck();
  await page.keyboard.press("Escape");
  await reload(page);
  await expect(heading(page)).toHaveText("Overview");

  for (const key of ["t", "[", "?", "g", "n"]) {
    await page.keyboard.press(key);
  }
  // That none of the keys did anything is asked after a later key has
  // been seen to act; asked at once, it would hold of any page that has
  // not got to the keys yet. The key is Tab, which reaches the skip link
  // only from the top of a page with no dialog open and no view arrived
  // at: the help would keep the focus to itself, and a new view would
  // have it on its heading.
  await page.keyboard.press(tabKey(browserName));
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await expect(html).toHaveAttribute("data-theme", theme ?? "");
  await expect(
    page.getByRole("button", { name: "Collapse sidebar" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(heading(page)).toHaveText("Overview");
  await expect(page).toHaveURL(/\/overview$/);

  await pressPaletteKeys(page);
  const field = page.getByRole("combobox");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await pressPaletteKeys(page);
  await field.pressSequentially("single-key");
  await expect(page.getByRole("option", { selected: true })).toHaveText(
    "Switch single-key shortcuts on",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("g");
  await page.keyboard.press("n");
  await expect(heading(page)).toHaveText("Nodes");
  expect(problems).toEqual([]);
});
