// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

import { storageKey as sidebarKey } from "../src/layout/sidebar.ts";
import { storageKey as themeKey } from "../src/theme/theme.ts";
import {
  button,
  notifications,
  openGallery,
  overlays,
  section,
} from "./gallery.ts";
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

    // The shell is as high as the window, and its regions scroll inside
    // it. In the rail a link keeps its name for assistive technology,
    // taken out of the flow: held by the page and not by its link, the
    // names of the links below the edge of a low window made the window
    // itself scroll, and the whole shell went out of sight.
    test("the window itself does not scroll", async ({ page }) => {
      await openAt(page, "/nodes");
      await settled(page, "Nodes");

      const beyond = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          down: root.scrollHeight - root.clientHeight,
          sideways: root.scrollWidth - root.clientWidth,
        };
      });
      expect(beyond).toEqual({ down: 0, sideways: 0 });
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

// The primitives in a small window: the gallery on a screen 320 px wide,
// and in the low windows above. A control is in a row that wraps, and
// what opens from one is fixed to the window, so it has to fit the window
// and scroll inside itself: nothing scrolls the page to a part of it that
// is past an edge (WCAG 2.1, success criteria 1.4.4 and 1.4.10).
for (const viewport of [
  { width: 320, height: 740 },
  { width: 640, height: 360 },
  { width: 320, height: 256 },
  { width: 1280, height: 220 },
]) {
  test.describe(`in a window ${String(viewport.width)} by ${String(viewport.height)}`, () => {
    test.use({ viewport });

    // The window itself scrolls in neither direction: the main region
    // does, downwards. A field whose label is left to assistive technology
    // takes that label out of the flow, and far down the gallery the page
    // held it and grew by it, so that the wheel over the header scrolled
    // the whole shell away.
    test("the gallery fits the window, which does not scroll", async ({
      page,
    }) => {
      const problems = await openGallery(page);

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
      expect(await scan(page)).toEqual([]);
      expect(problems).toEqual([]);
    });

    for (const overlay of overlays) {
      test(`${overlay.name} of the gallery is on the screen in full`, async ({
        page,
        browserName,
      }) => {
        const problems = await openGallery(page);

        const shown = await overlay.open(page, browserName);

        await expect(shown).toBeInViewport({ ratio: 1 });
        // Squeezed into a low window, an overlay scrolls inside itself,
        // and a part that scrolls has rules of its own. The scan with
        // each overlay open at its full size is in gallery.spec.ts.
        if (viewport.height < 300) {
          expect(await scan(page)).toEqual([]);
        }
        expect(problems).toEqual([]);
      });
    }

    // The box of a dialog on the screen says nothing of what the box cuts
    // off. In the lowest window the head of a dialog and its buttons,
    // which go on in a second line, are higher than the dialog may be:
    // what does not fit has to be in reach by scrolling the dialog, and
    // must not be cut off by it.
    test("nothing of a dialog is cut off for good, and its last button comes onto the screen", async ({
      page,
    }) => {
      const problems = await openGallery(page);
      await button(page, "Dialog", "Open dialog").focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Example dialog" });
      await expect(
        dialog.getByRole("textbox", { name: "Dialog name" }),
      ).toBeFocused();

      const held = await dialog.evaluate((frame) => ({
        fits: frame.scrollHeight <= frame.clientHeight,
        scrolls: ["auto", "scroll"].includes(getComputedStyle(frame).overflowY),
      }));
      expect(held.fits || held.scrolls).toBe(true);

      // All of the button but a fraction of a pixel: the dialog stands in
      // the middle of the window, which puts its edge between two pixels.
      const save = dialog.getByRole("button", { name: "Save changes" });
      await save.focus();
      await expect(save).toBeInViewport({ ratio: 0.95 });
      const [edge, last] = await Promise.all([
        dialog.boundingBox(),
        save.boundingBox(),
      ]);
      if (!edge || !last) {
        throw new Error("the dialog has no place on the page");
      }
      expect(last.y).toBeGreaterThanOrEqual(edge.y - 1);
      expect(last.y + last.height).toBeLessThanOrEqual(
        edge.y + edge.height + 1,
      );
      // And the way back to its top is open.
      await dialog.evaluate((frame) => {
        frame.scrollTo(0, 0);
      });
      await expect(
        dialog.getByRole("heading", { name: "Example dialog" }),
      ).toBeInViewport({ ratio: 1 });
      expect(problems).toEqual([]);
    });

    // The buttons of a confirmation are what answers it. They stay where
    // they are while what is between them and the question scrolls: the
    // body of the request inside its box, and in a low window the box
    // with it. Each is a stop of the Tab key while it scrolls.
    test("the buttons of a confirmation are in the window, and its request is read to its end by the keyboard", async ({
      page,
      browserName,
    }) => {
      const problems = await openGallery(page);
      await button(page, "ConfirmDialog", "Send example").focus();
      await page.keyboard.press("Enter");
      const confirmation = page.getByRole("alertdialog", {
        name: "Send the example?",
      });
      const cancel = confirmation.getByRole("button", { name: "Cancel" });
      const confirm = confirmation.getByRole("button", {
        name: "Send example",
      });
      await expect(cancel).toBeFocused();
      await expect(cancel).toBeInViewport({ ratio: 1 });
      await expect(confirm).toBeInViewport({ ratio: 1 });

      const atItsEnd = (element: Element) =>
        Math.ceil(element.scrollTop + element.clientHeight) >=
        element.scrollHeight;
      // Back from Cancel is the body of the request, which is longer
      // than its box.
      const request = confirmation.locator("pre");
      expect(await request.evaluate(atItsEnd)).toBe(false);
      await page.keyboard.press(`Shift+${tabKey(browserName)}`);
      await expect(request).toBeFocused();
      await page.keyboard.press("End");
      await expect.poll(() => request.evaluate(atItsEnd)).toBe(true);

      // What is around the request scrolls where the window is too low
      // for all of the confirmation, and only there is it a stop.
      const around = request.locator("xpath=ancestor::div[@tabindex][1]");
      const low = viewport.height < 400;
      await expect(around).toHaveAttribute("tabindex", low ? "0" : "-1");
      if (low) {
        await page.keyboard.press(`Shift+${tabKey(browserName)}`);
        await expect(around).toBeFocused();
        await page.keyboard.press("End");
        await expect.poll(() => around.evaluate(atItsEnd)).toBe(true);
      }
      // The last line of the request is on the screen now, above the
      // buttons, which have not moved.
      const [end, edge] = await Promise.all([
        request.boundingBox(),
        around.boundingBox(),
      ]);
      if (!end || !edge) {
        throw new Error("the request has no place on the page");
      }
      expect(end.y + end.height).toBeLessThanOrEqual(edge.y + edge.height);
      await expect(cancel).toBeInViewport({ ratio: 1 });
      await expect(confirm).toBeInViewport({ ratio: 1 });
      expect(problems).toEqual([]);
    });

    test("a dialog longer than the window scrolls to its end by the keyboard, and its button stays", async ({
      page,
      browserName,
    }) => {
      const problems = await openGallery(page);
      await button(page, "Dialog", "Open long dialog").focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Long example dialog" });
      const closeButton = dialog.getByRole("button", { name: "Close" });
      await expect(closeButton).toBeFocused();
      await expect(dialog).toBeInViewport({ ratio: 1 });
      const last = dialog.getByText("Paragraph 14 of");
      await expect(last).not.toBeInViewport();

      await page.keyboard.press(`Shift+${tabKey(browserName)}`);
      await page.keyboard.press("End");

      await expect(last).toBeInViewport();
      await expect(closeButton).toBeInViewport({ ratio: 1 });
      expect(problems).toEqual([]);
    });

    test("the drawer can be scrolled to its end by the keyboard", async ({
      page,
      browserName,
    }) => {
      const problems = await openGallery(page);
      await button(page, "Drawer", "Open drawer").focus();
      await page.keyboard.press("Enter");
      const drawer = page.getByRole("dialog", { name: "Example details" });
      await expect(drawer).toBeFocused();
      const last = drawer.getByText("Paragraph 18 of");
      await expect(last).not.toBeInViewport();

      // To the part that scrolls: the body below a header that stays,
      // or, in a low window, the whole drawer, from the first control in
      // it.
      const body = drawer.getByRole("tabpanel", { name: "Summary" });
      if (viewport.height < 480) {
        await page.keyboard.press(tabKey(browserName));
        await expect(
          drawer.getByRole("button", { name: "Close" }),
        ).toBeFocused();
      } else {
        await body.focus();
      }
      await page.keyboard.press("End");

      await expect(last).toBeInViewport();
      expect(problems).toEqual([]);
    });

    // Five toasts are more than a low window is high. The region scrolls
    // then, so that the first is still reached.
    test("every toast that shows can be brought onto the screen", async ({
      page,
      browserName,
    }) => {
      const problems = await openGallery(page);
      for (const name of [
        "Show a failure",
        "Show a failure",
        "Show a failure",
        "Show a warning",
        "Show a failure",
      ]) {
        await button(page, "Toast", name).focus();
        await page.keyboard.press("Enter");
      }
      const toasts = notifications(page).getByRole("dialog");
      await expect(toasts).toHaveCount(5);

      await page.keyboard.press("F6");
      await expect(notifications(page)).toBeFocused();
      for (let toast = 0; toast < 5; toast++) {
        await page.keyboard.press(tabKey(browserName));
        await expect(toasts.nth(toast)).toBeFocused();
        // All of it, but for the part of a pixel a scroll position
        // rounds away.
        await expect(toasts.nth(toast)).toBeInViewport({ ratio: 0.99 });
        // On to its button, the stop before the next toast.
        await page.keyboard.press(tabKey(browserName));
      }
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

  // The primitives say several states by a fill or by the colour of a
  // border alone: a chip that is pressed, the chosen segment, a toggle
  // that is pressed, a field that is invalid. With the fills gone and
  // every border in one colour, the border of that state is twice as
  // thick as the others.
  test("a pressed chip, the chosen segment, a pressed toggle and an invalid field have a thicker border than the others", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const pairs = [
      {
        what: "a chip",
        marked: button(page, "Chip", "First filter"),
        other: button(page, "Chip", "Second filter"),
      },
      {
        what: "a segment",
        marked: section(page, "SegmentedControl")
          .getByRole("radio", { name: "First range" })
          .first(),
        other: section(page, "SegmentedControl")
          .getByRole("radio", { name: "Second range" })
          .first(),
      },
      {
        what: "a toggle",
        marked: button(page, "IconButton", "Mark example"),
        other: button(page, "IconButton", "Lock example"),
      },
      {
        what: "a text field",
        marked: section(page, "Input").getByRole("textbox", {
          name: "Required name",
        }),
        other: section(page, "Input").getByRole("textbox", {
          name: "Example title",
        }),
      },
      {
        what: "a select",
        marked: section(page, "Select").getByRole("combobox", {
          name: "Required choice",
        }),
        other: section(page, "Select").getByRole("combobox", {
          name: "Example choice",
        }),
      },
    ];

    for (const { what, marked, other } of pairs) {
      await expect(marked, what).toHaveCSS("border-top-style", "solid");
      await expect(marked, what).toHaveCSS("border-top-width", "2px");
      await expect(other, what).toHaveCSS("border-top-style", "solid");
      await expect(other, what).toHaveCSS("border-top-width", "1px");
    }
    expect(problems).toEqual([]);
  });

  // A filled button and a badge have no border to see, and nothing but
  // their fill sets them apart from the text around them.
  test("a filled button and a badge have a border", async ({ page }) => {
    const problems = await openGallery(page);

    for (const control of [
      button(page, "Button", "Save changes"),
      button(page, "Button", "Delete example"),
      button(page, "Button", "Show details"),
      section(page, "Badge").getByText("Warning").first(),
    ]) {
      await expect(control).toHaveCSS("border-top-style", "solid");
      await expect(control).toHaveCSS("border-top-width", "1px");
      // Painted, in a colour of the system: a border that stayed
      // transparent would be none.
      await expect(control).not.toHaveCSS(
        "border-top-color",
        "rgba(0, 0, 0, 0)",
      );
    }
    expect(problems).toEqual([]);
  });

  // The line under a tab is the one thing that says which is selected. A
  // transparent line under the others would be painted too, and every tab
  // would look selected.
  test("the active tab has a line under it and the others none", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const tabs = section(page, "Tabs").getByRole("tablist", {
      name: "Example parts",
      exact: true,
    });

    await expect(tabs.getByRole("tab", { name: "First tab" })).toHaveCSS(
      "border-bottom-width",
      "2px",
    );
    for (const name of ["Second tab", "Third tab", "Fourth tab"]) {
      await expect(tabs.getByRole("tab", { name })).toHaveCSS(
        "border-bottom-width",
        "0px",
      );
    }
    expect(problems).toEqual([]);
  });

  // The marked entry of a menu and of the list of a select has the focus,
  // and with it the ring, which a contrast theme keeps where it removes
  // the background that marks the entry otherwise.
  test("the marked entry of a menu and of a select has the ring of the focus", async ({
    page,
  }) => {
    const problems = await openGallery(page);

    await button(page, "Menu", "Actions").focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Actions" });
    const first = menu.getByRole("menuitem", { name: "First action" });
    await expect(first).toBeFocused();
    await expect(first).toHaveCSS("outline-style", "solid");
    await expect(first).toHaveCSS("outline-width", "2px");
    await expect(
      menu.getByRole("menuitem", { name: /Third action/ }),
    ).toHaveCSS("outline-style", "none");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await section(page, "Select")
      .getByRole("combobox", { name: "Example choice" })
      .focus();
    await page.keyboard.press("Enter");
    const list = page.getByRole("listbox", { name: "Example choice" });
    const option = list.getByRole("option", { name: "First option" });
    await expect(option).toBeFocused();
    await expect(option).toHaveCSS("outline-style", "solid");
    await expect(option).toHaveCSS("outline-width", "2px");
    await expect(list.getByRole("option", { name: "Second option" })).toHaveCSS(
      "outline-style",
      "none",
    );
    // The menu and the list set their places from a script, which the
    // server's policy must not refuse under a contrast theme either.
    expect(problems).toEqual([]);
  });

  // A contrast theme paints text in a colour of the system. An icon with a
  // colour class of its own kept the token's, of the theme that is stored
  // in sdash, which can be the opposite of the system's: the tick that
  // alone marks the chosen option, the arrow of a select and the lock of a
  // field that cannot be edited were then at 2.1:1 on the system's
  // background (WCAG 2.1, success criterion 1.4.11). Each takes the colour
  // of the text it stands in.
  for (const stored of ["light", "dark"] as const) {
    test(`the tick, the arrow and the lock have the colour of the text, with the ${stored} theme stored`, async ({
      page,
    }) => {
      await withStored(page, themeKey, stored);
      const problems = await openGallery(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", stored);
      /** The colour of the first icon in an element, and of the element. */
      const colours = (element: Element) => {
        const icon = element.querySelector("svg");
        return {
          icon: icon ? getComputedStyle(icon).color : "none",
          text: getComputedStyle(element).color,
        };
      };
      const alike = async (
        what: string,
        holder: ReturnType<typeof section>,
      ) => {
        const { icon, text } = await holder.evaluate(colours);
        expect(icon, what).toBe(text);
      };

      await alike(
        "the lock",
        section(page, "Input").locator("label", { hasText: "Example id" }),
      );
      const field = section(page, "Select").getByRole("combobox", {
        name: "Chosen example",
      });
      await alike("the arrow", field);
      await field.focus();
      await page.keyboard.press("Enter");
      const chosen = page
        .getByRole("listbox", { name: "Chosen example" })
        .getByRole("option", { selected: true });
      await expect(chosen).toBeVisible();
      await alike("the tick", chosen);
      expect(problems).toEqual([]);
    });
  }
});
