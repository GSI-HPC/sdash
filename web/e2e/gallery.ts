// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the end-to-end tests of the primitives share: the way into the
// gallery, its sections, and each kind of overlay with how the keyboard
// opens it. The gallery is the page that shows every primitive in the
// binary, under the server's Content-Security-Policy
// (doc/adr/0026-ui-primitives-on-base-ui.md).

import { expect, type Locator, type Page } from "@playwright/test";

import { galleryPath, galleryTitle } from "../src/gallery/page.ts";
import { heading, openAt, tabKey, tooltips } from "./support.ts";

/**
 * Opens sdash at the gallery, waits for the gallery to show, and returns
 * what open returns: the list of what the browser reports as going wrong.
 */
export async function openGallery(page: Page): Promise<string[]> {
  const problems = await openAt(page, galleryPath);
  await expect(heading(page)).toHaveText(galleryTitle);
  return problems;
}

/**
 * A section of the gallery, by the name of its primitive. It is a region
 * named by its heading.
 */
export function section(page: Page, title: string): Locator {
  return page
    .getByRole("main")
    .getByRole("region", { name: title, exact: true });
}

/** A button of a section, by its exact name. */
export function button(page: Page, title: string, name: string): Locator {
  return section(page, title).getByRole("button", { name, exact: true });
}

/** The region the toasts appear in. */
export function notifications(page: Page): Locator {
  return page.getByRole("region", { name: "Notifications" });
}

/**
 * Puts the keyboard focus on a control as the Tab key does, from the
 * control before it. A tooltip shows on the focus of the keyboard and not
 * on one a script set, and what counts as which differs between engines.
 */
export async function tabTo(
  page: Page,
  browserName: string,
  from: Locator,
  to: Locator,
): Promise<void> {
  await from.focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(to).toBeFocused();
}

/**
 * Presses Enter on a control, as a keyboard user who has reached it does:
 * with the control on the screen. Chromium and Firefox scroll to a control
 * inside focus() itself. WebKit scrolls a moment later, in a step of its
 * own, to whatever has the focus by then. A key sent in the same breath
 * opens what the control opens while the control is still out of sight: a
 * popup is placed beside its control, takes the focus, and the control is
 * never scrolled to.
 */
export async function press(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await expect(control).toBeInViewport();
  await page.keyboard.press("Enter");
}

/** One kind of overlay: what opens it in the gallery, and what then shows. */
export interface Overlay {
  /** What the overlay is, for the name of a test. */
  readonly name: string;
  /**
   * Opens it by the keyboard and returns it, once it shows where it will
   * stay.
   */
  readonly open: (page: Page, browserName: string) => Promise<Locator>;
  /**
   * Closes it by the keyboard, where Escape alone does not: a toast takes
   * no focus, so the focus has to be brought to it first.
   */
  readonly close?: (page: Page, browserName: string) => Promise<void>;
}

/**
 * Every kind of overlay the primitives have, as the gallery shows it. The
 * tests of the scan, of the low windows and of the policy go through this
 * list, so that a new kind is in all three.
 */
export const overlays: readonly Overlay[] = [
  {
    name: "a tooltip that names its control",
    open: async (page, browserName) => {
      await tabTo(
        page,
        browserName,
        button(page, "Tooltip", "Shown above"),
        button(page, "Tooltip", "Shown to the right"),
      );
      const tooltip = tooltips(page);
      // The one tooltip that shows, once the one of the button before has
      // gone: a list waits for that (tooltips in support.ts).
      await expect(tooltip).toHaveText(["Shown to the right"]);
      return tooltip;
    },
  },
  {
    name: "a tooltip that describes its control",
    open: async (page, browserName) => {
      await tabTo(
        page,
        browserName,
        button(page, "Tooltip", "Send example"),
        button(page, "Tooltip", "Delete nothing"),
      );
      const tooltip = page.getByRole("tooltip").filter({ visible: true });
      // A list, which waits for the tooltip of the button before to go
      // (tooltips in support.ts). toContainText would let two through:
      // its list may be a part of what shows.
      await expect(tooltip).toHaveText([/There is nothing to delete yet/]);
      return tooltip;
    },
  },
  {
    name: "a popover",
    open: async (page) => {
      await press(page, button(page, "Popover", "Example settings"));
      const popover = page.getByRole("dialog", { name: "Example settings" });
      await expect(
        popover.getByRole("textbox", { name: "Settings name" }),
      ).toBeFocused();
      return popover;
    },
  },
  {
    name: "a menu",
    open: async (page) => {
      await press(page, button(page, "Menu", "Actions"));
      const menu = page.getByRole("menu", { name: "Actions" });
      await expect(
        menu.getByRole("menuitem", { name: "First action" }),
      ).toBeFocused();
      return menu;
    },
  },
  {
    name: "the list of a select",
    open: async (page) => {
      await press(
        page,
        section(page, "Select").getByRole("combobox", {
          name: "Example choice",
        }),
      );
      const list = page.getByRole("listbox", { name: "Example choice" });
      await expect(
        list.getByRole("option", { name: "First option" }),
      ).toBeFocused();
      return list;
    },
  },
  {
    name: "a dialog",
    open: async (page) => {
      await press(page, button(page, "Dialog", "Open dialog"));
      const dialog = page.getByRole("dialog", { name: "Example dialog" });
      await expect(
        dialog.getByRole("textbox", { name: "Dialog name" }),
      ).toBeFocused();
      return dialog;
    },
  },
  {
    name: "a confirmation",
    open: async (page) => {
      await press(page, button(page, "ConfirmDialog", "Send example"));
      const confirmation = page.getByRole("alertdialog", {
        name: "Send the example?",
      });
      await expect(
        confirmation.getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      return confirmation;
    },
  },
  {
    name: "a drawer",
    open: async (page) => {
      await press(page, button(page, "Drawer", "Open drawer"));
      const drawer = page.getByRole("dialog", { name: "Example details" });
      await expect(drawer).toBeFocused();
      // Until it has slid in, its place on the screen is not the one it
      // keeps.
      await expect
        .poll(async () => {
          const box = await drawer.boundingBox();
          const width = page.viewportSize()?.width ?? NaN;
          return box ? Math.round(box.x + box.width) - width : NaN;
        })
        .toBe(0);
      return drawer;
    },
  },
  {
    // The toast of a failure, which stays until it is dismissed: one that
    // goes by itself could be gone before a test has looked at it.
    name: "a toast",
    open: async (page) => {
      await press(page, button(page, "Toast", "Show a failure"));
      const toast = notifications(page).getByRole("dialog", {
        name: "Changes not saved",
      });
      await expect(toast).toBeVisible();
      await expect(toast).toHaveCSS("opacity", "1");
      return toast;
    },
    close: async (page, browserName) => {
      await page.keyboard.press("F6");
      await expect(notifications(page)).toBeFocused();
      await page.keyboard.press(tabKey(browserName));
      await page.keyboard.press("Escape");
    },
  },
];

/** Closes an overlay by the keyboard: by Escape, unless it says otherwise. */
export async function close(
  overlay: Overlay,
  page: Page,
  browserName: string,
): Promise<void> {
  if (overlay.close) {
    await overlay.close(page, browserName);
  } else {
    await page.keyboard.press("Escape");
  }
}
