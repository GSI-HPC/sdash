// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, type Locator, type Page, test } from "@playwright/test";

import { galleryPath, galleryTitle, sections } from "../src/gallery/page.ts";
import {
  button,
  close,
  notifications,
  openGallery,
  overlays,
  press,
  section,
  tabTo,
} from "./gallery.ts";
import {
  heading,
  openAt,
  pressPaletteKeys,
  scan,
  tabKey,
  tooltips,
} from "./support.ts";

// The primitives in the binary: every control and every overlay of the
// gallery used by the keyboard alone, under the server's
// Content-Security-Policy, and scanned in each of its states
// (doc/adr/0026-ui-primitives-on-base-ui.md). What each primitive does in
// detail is in the component tests beside it. The gallery as it comes is
// scanned with the views, in accessibility.spec.ts; an enlarged page and
// a contrast theme of the system are in zoom-and-contrast.spec.ts.

/** The theme the page shows. */
function themeOf(page: Page): Promise<string | null> {
  return page.locator("html").getAttribute("data-theme");
}

// The server allows no inline script, no style element and no style
// attribute in the markup (doc/adr/0012-local-listener-security.md). Base
// UI sets positions from its scripts, which is allowed, and would add a
// style element for one of its parts, which is not: the browser reports a
// refusal to the console, where the list of problems picks it up.
test("every overlay opens and closes by the keyboard under the server's Content-Security-Policy", async ({
  page,
  browserName,
}) => {
  const problems = await openGallery(page);

  for (const overlay of overlays) {
    const shown = await overlay.open(page, browserName);
    await expect(shown, overlay.name).toBeVisible();
    await close(overlay, page, browserName);
    await expect(shown, overlay.name).toBeHidden();
  }

  // Nothing of the page is left hidden from assistive technology or out
  // of reach of the pointer by an overlay that has gone.
  await expect(page.locator('#root[aria-hidden="true"]')).toHaveCount(0);
  await expect(page.locator("#root[inert], #root [inert]")).toHaveCount(0);
  await expect(page.locator("style")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("the gallery has a section for every primitive, and a link that leads to each", async ({
  page,
}) => {
  const problems = await openGallery(page);

  await expect(
    page.getByRole("main").getByRole("heading", { level: 2 }),
  ).toHaveText(sections.map(({ title }) => title));
  const drawer = page.getByRole("heading", { level: 2, name: "Drawer" });
  await expect(drawer).not.toBeInViewport();

  const link = page
    .getByRole("list", { name: "Sections" })
    .getByRole("link", { name: "Drawer" });
  await link.focus();
  await page.keyboard.press("Enter");

  await expect(drawer).toBeFocused();
  await expect(drawer).toBeInViewport();
  await expect(page).toHaveURL(new RegExp(`${galleryPath}#drawer$`));
  await expect(page).toHaveTitle(`${galleryTitle} - sdash`);
  expect(problems).toEqual([]);
});

// A link into the gallery names a section by the fragment of the address.
// The page is drawn by a script, after the browser has looked for the
// fragment and found nothing, so it is the gallery that goes there.
test("the address of a section shows that section, with the focus on its heading", async ({
  page,
}) => {
  const problems = await openAt(page, `${galleryPath}#toast`);

  const toast = page.getByRole("heading", { level: 2, name: "Toast" });
  await expect(toast).toBeFocused();
  await expect(toast).toBeInViewport();
  await expect(heading(page)).toHaveText(galleryTitle);
  expect(problems).toEqual([]);
});

test.describe("the controls, by the keyboard alone", () => {
  // A button that is disabled leaves the order of the Tab key. One that
  // has a reason to give keeps its place, so that a keyboard user can
  // reach it and read why.
  test("a disabled button is passed over, and one with a reason is reached and gives it", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const reason = "Nothing has changed, so there is nothing to save.";

    // From the last button before the disabled ones, over all five of
    // them.
    const withReason = button(page, "Button", "Save nothing");
    await tabTo(
      page,
      browserName,
      button(page, "Button", "More options"),
      withReason,
    );
    await expect(withReason).toHaveAttribute("aria-disabled", "true");
    await expect(withReason).toHaveAccessibleDescription(reason);
    await expect(
      page.getByRole("tooltip").filter({ visible: true }),
    ).toHaveText(reason);
    await expect(button(page, "Button", "Save draft")).toBeDisabled();

    await page.keyboard.press(tabKey(browserName));
    await expect(button(page, "Button", "Send nothing")).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("an icon button that is a toggle is pressed by Enter, by Space and by its key", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const toggle = button(page, "IconButton", "Lock example");
    await tabTo(
      page,
      browserName,
      button(page, "IconButton", "Large icon"),
      toggle,
    );
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    // What it is called, and the key that does the same, beside it.
    // A list, which waits for the tooltip of the button before to go
    // (tooltips in support.ts).
    await expect(tooltips(page)).toHaveText(["Lock examplel"]);

    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("l");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("a chip is switched by Space and by Enter and keeps the focus", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const chip = button(page, "Chip", "First filter");
    await expect(chip).toHaveAttribute("aria-pressed", "true");

    await chip.focus();
    await page.keyboard.press("Space");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Enter");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toBeFocused();
    // The count is part of the name.
    await expect(
      section(page, "Chip").getByRole("button", { name: "Counted filter 12" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(problems).toEqual([]);
  });

  // The letters typed into a field are the field's: "t" switches no theme
  // and "l" presses no toggle.
  test("a text field takes what is typed, shortcuts included, and is invalid only while it is empty", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const theme = await themeOf(page);
    const field = section(page, "Input").getByRole("textbox", {
      name: "Required name",
    });
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription(/Enter a name\./);

    await field.focus();
    await page.keyboard.type("tl");

    await expect(field).toHaveValue("tl");
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription(
      "Type anything to make it valid.",
    );
    expect(await themeOf(page)).toBe(theme);
    await expect(button(page, "IconButton", "Lock example")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    expect(problems).toEqual([]);
  });

  test("a select chooses by the keyboard, passes over nothing it cannot choose, and gives the focus back", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const theme = await themeOf(page);
    const field = section(page, "Select").getByRole("combobox", {
      name: "Example choice",
    });
    const list = page.getByRole("listbox", { name: "Example choice" });
    await expect(field).toHaveText("Choose an option");

    await field.focus();
    await page.keyboard.press("Enter");
    await expect(
      list.getByRole("option", { name: "First option" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(field).toHaveText("Second option");
    await expect(field).toBeFocused();

    // The third option is listed, reached and cannot be chosen.
    await page.keyboard.press("ArrowDown");
    const third = list.getByRole("option", { name: "Third option" });
    await expect(
      list.getByRole("option", { name: "Second option" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(third).toBeFocused();
    await expect(third).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(third).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(field).toHaveText("Second option");
    await expect(field).toBeFocused();

    // A letter on the closed field chooses the next option that starts
    // with it, and is no shortcut of the page: "f" finds the fourth
    // option, and "t" finds none it may choose and switches no theme.
    // That is asked once Enter, pressed after it, has opened the list.
    await page.keyboard.press("f");
    await expect(field).toHaveText("Fourth option");
    await page.keyboard.press("t");
    await page.keyboard.press("Enter");
    await expect(
      list.getByRole("option", { name: "Fourth option" }),
    ).toBeFocused();
    await expect(field).toHaveText("Fourth option");
    expect(await themeOf(page)).toBe(theme);
    expect(problems).toEqual([]);
  });

  test("a segmented control moves its choice with the arrow keys and wraps", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const group = section(page, "SegmentedControl").getByRole("radiogroup", {
      name: "Example range",
      exact: true,
    });
    const segment = (name: string) => group.getByRole("radio", { name });
    await expect(segment("First range")).toBeChecked();

    await segment("First range").focus();
    await page.keyboard.press("ArrowRight");
    await expect(segment("Second range")).toBeChecked();
    await expect(segment("Second range")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(segment("Third range")).toBeChecked();
    await expect(segment("Third range")).toBeFocused();
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test("tabs move with the arrow keys, stop on a disabled tab without showing it, and the Tab key goes on to the panel", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const tabs = section(page, "Tabs").getByRole("tablist", {
      name: "Example parts",
      exact: true,
    });
    const tab = (name: string) => tabs.getByRole("tab", { name });
    const panel = section(page, "Tabs").getByRole("tabpanel").first();
    await expect(tab("First tab")).toHaveAttribute("aria-selected", "true");

    await tab("First tab").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab("Second tab")).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveText("The panel of the second tab.");

    await page.keyboard.press("ArrowRight");
    await expect(tab("Third tab")).toBeFocused();
    await expect(tab("Third tab")).toHaveAttribute("aria-disabled", "true");
    await expect(tab("Third tab")).toHaveAttribute("aria-selected", "false");
    await expect(panel).toHaveText("The panel of the second tab.");

    await page.keyboard.press("ArrowRight");
    await expect(tab("Fourth tab")).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveText("The panel of the fourth tab.");
    await page.keyboard.press(tabKey(browserName));
    await expect(panel).toBeFocused();
    await expect(panel).toHaveAccessibleName("Fourth tab");
    expect(problems).toEqual([]);
  });
});

test.describe("the overlays, by the keyboard alone", () => {
  test("a menu reaches a disabled entry, which gives its reason, and runs the entry Enter chooses", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const theme = await themeOf(page);
    const trigger = button(page, "Menu", "Actions");
    const menu = page.getByRole("menu", { name: "Actions" });
    const line = section(page, "Menu").getByText("Chosen last:");
    await expect(line).toHaveText(
      "Chosen last: nothing yet. The order is the first one.",
    );

    await press(page, trigger);
    await expect(
      menu.getByRole("menuitem", { name: "First action" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const second = menu.getByRole("menuitem", { name: "Second action" });
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-disabled", "true");
    await expect(
      page.getByRole("tooltip").filter({ visible: true }),
    ).toHaveText("There is nothing for the second action to act on yet.");
    await page.keyboard.press("Enter");
    await expect(second).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: /Third action/ }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(line).toContainText("Chosen last: Third action.");

    // The choice inside the menu, from its end. A letter jumps to the
    // entry that starts with it and is no shortcut of the page: "t" goes
    // to the third action and switches no theme.
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "First action" }),
    ).toBeFocused();
    await page.keyboard.press("t");
    await expect(
      menu.getByRole("menuitem", { name: /Third action/ }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      menu.getByRole("menuitem", { name: "Delete example" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    const secondOrder = menu.getByRole("menuitemradio", {
      name: "Second order",
    });
    await expect(secondOrder).toBeFocused();
    await expect(secondOrder).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(line).toContainText("The order is the second one.");

    // Escape closes it and runs nothing.
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(line).toHaveText(
      "Chosen last: Third action. The order is the second one.",
    );
    expect(await themeOf(page)).toBe(theme);
    expect(problems).toEqual([]);
  });

  test("a popover takes the focus, keeps the keys of the page to itself and gives the focus back", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    const theme = await themeOf(page);
    const trigger = button(page, "Popover", "Example filters");
    const popover = page.getByRole("dialog", { name: "Example filters" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.focus();
    await page.keyboard.press("Enter");
    const chip = popover.getByRole("button", { name: "First filter" });
    await expect(chip).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(chip).toHaveAttribute("aria-pressed", "true");

    // "t" and then Space, which is seen to act: the theme has not been
    // switched by then.
    await page.keyboard.press("t");
    await page.keyboard.press("Space");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(await themeOf(page)).toBe(theme);

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
    // And the keys are the page's again.
    await page.keyboard.press("t");
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-theme",
      theme ?? "",
    );
    expect(problems).toEqual([]);
  });

  test("a popover closes when the Tab key leaves it, and a select inside it opens and closes by itself", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const trigger = button(page, "Popover", "Example settings");
    const popover = page.getByRole("dialog", { name: "Example settings" });

    await press(page, trigger);
    await expect(
      popover.getByRole("textbox", { name: "Settings name" }),
    ).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    const choice = popover.getByRole("combobox", { name: "Settings choice" });
    await expect(choice).toBeFocused();
    const scrolled = () =>
      page.getByRole("main").evaluate((region) => region.scrollTop);
    const before = await scrolled();
    await page.keyboard.press("Enter");
    const list = page.getByRole("listbox", { name: "Settings choice" });
    await expect(
      list.getByRole("option", { name: "First option" }),
    ).toBeFocused();
    // The list takes the focus where it shows, below its field: the page
    // has not been scrolled to it, away from the popover.
    expect(await scrolled()).toBe(before);
    await expect(popover).toBeInViewport({ ratio: 1 });
    await expect(list).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(popover).toBeVisible();
    await expect(choice).toBeFocused();

    await page.keyboard.press(tabKey(browserName));
    await expect(popover.getByRole("button", { name: "Done" })).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(popover).toBeHidden();
    // On into the page, to the control after the one that opened it.
    await expect(button(page, "Popover", "Example filters")).toBeFocused();
    expect(problems).toEqual([]);
  });

  // The first Escape is the tooltip's and the second the dialog's.
  test("Escape closes the tooltip of a control in a dialog and leaves the dialog", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "Dialog", "Open dialog");
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Example dialog",
      exact: true,
    });
    await expect(dialog).toBeVisible();

    const search = dialog.getByRole("button", { name: "Search in the dialog" });
    await tabTo(
      page,
      browserName,
      dialog.getByRole("combobox", { name: "Dialog choice" }),
      search,
    );
    await expect(tooltips(page)).toHaveText("Search in the dialog");

    await page.keyboard.press("Escape");
    await expect(tooltips(page)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("a dialog keeps the focus inside, holds the list of its select, and gives the focus back when it is done", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "Dialog", "Open dialog");
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Example dialog",
      exact: true,
    });
    await expect(dialog).toHaveAccessibleDescription(
      /A dialog with a small form/,
    );
    await expect(
      dialog.getByRole("textbox", { name: "Dialog name" }),
    ).toBeFocused();

    // The list of the select is part of the dialog, to the page and to
    // assistive technology.
    await page.keyboard.press(tabKey(browserName));
    const choice = dialog.getByRole("combobox", { name: "Dialog choice" });
    await expect(choice).toBeFocused();
    await page.keyboard.press("Enter");
    const list = dialog.getByRole("listbox", { name: "Dialog choice" });
    await expect(
      list.getByRole("option", { name: "First option" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(choice).toHaveText("Second option");
    await expect(choice).toBeFocused();
    await expect(dialog).toBeVisible();

    // Round the dialog: the Tab key does not leave it.
    for (const name of ["Search in the dialog", "Cancel", "Save changes"]) {
      await page.keyboard.press(tabKey(browserName));
      await expect(dialog.getByRole("button", { name })).toBeFocused();
    }
    await page.keyboard.press(tabKey(browserName));
    await expect(
      dialog.getByRole("textbox", { name: "Dialog name" }),
    ).toBeFocused();

    await dialog.getByRole("button", { name: "Save changes" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    // The toast says so without taking the focus.
    await expect(
      notifications(page).getByRole("dialog", { name: "Example form saved" }),
    ).toBeVisible();
    await expect(opener).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("a confirmation starts on Cancel, shows the request, and is answered by its buttons and by Escape alone", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "ConfirmDialog", "Delete example");
    const answer = section(page, "ConfirmDialog").getByText("The last answer:");
    const confirmation = page.getByRole("alertdialog", {
      name: "Delete the example?",
    });
    await expect(answer).toHaveText("The last answer: none yet.");

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(
      confirmation.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await expect(confirmation).toHaveAccessibleDescription(/removed for good/);
    const request = confirmation.getByRole("group", { name: "Request" });
    await expect(request).toHaveText("DELETE/example");

    // A press outside it answers nothing: it is still there to be
    // answered, and the answer it then gets is its first.
    await page.mouse.click(5, 100);
    await expect(confirmation).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(confirmation).toBeHidden();
    await expect(answer).toHaveText("The last answer: cancelled.");
    await expect(opener).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(
      confirmation.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(
      confirmation.getByRole("button", { name: "Delete example" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmation).toBeHidden();
    await expect(answer).toHaveText("The last answer: confirmed.");
    await expect(opener).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("a confirmation that needs an input cannot be confirmed before it has one, and shows the input in the request", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "ConfirmDialog", "Rename example");
    const confirmation = page.getByRole("alertdialog", {
      name: "Rename the example?",
    });

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(
      confirmation.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    const confirm = confirmation.getByRole("button", {
      name: "Rename example",
    });
    await expect(confirm).toBeDisabled();
    // The button that cannot be used is no stop: the Tab key goes round
    // to the field.
    await page.keyboard.press(tabKey(browserName));
    const field = confirmation.getByRole("textbox", { name: "New name" });
    await expect(field).toBeFocused();

    await page.keyboard.type("Second example");
    await expect(
      confirmation.getByRole("group", { name: "Request" }),
    ).toContainText('"name": "Second example"');
    await expect(confirm).toBeEnabled();
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(confirmation).toBeHidden();
    await expect(
      section(page, "ConfirmDialog").getByText("The last answer:"),
    ).toHaveText("The last answer: confirmed.");
    await expect(opener).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("a drawer takes the focus, closes on Escape after the tooltip of its button, and gives the focus back", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "Drawer", "Open drawer");
    const drawer = page.getByRole("dialog", { name: "Example details" });

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(drawer).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
    await expect(tooltips(page)).toHaveText("CloseEsc");

    await page.keyboard.press("Escape");
    await expect(tooltips(page)).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();

    // And by its button.
    await page.keyboard.press("Enter");
    await expect(drawer).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await page.keyboard.press("Enter");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("a drawer shows the panel of its tabs, holds the list of its select, and goes with the confirmation opened from it", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "Drawer", "Open drawer");
    const drawer = page.getByRole("dialog", { name: "Example details" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(drawer).toBeFocused();

    await drawer.getByRole("tab", { name: "Summary" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(drawer.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const choice = drawer.getByRole("combobox", { name: "Drawer choice" });
    await choice.focus();
    await page.keyboard.press("Enter");
    const list = drawer.getByRole("listbox", { name: "Drawer choice" });
    await expect(
      list.getByRole("option", { name: "First option" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect(choice).toBeFocused();

    // The confirmation over the drawer: cancelled, the drawer stays and
    // has the focus back; confirmed, both go.
    const remove = drawer.getByRole("button", { name: "Delete example" });
    const confirmation = page.getByRole("alertdialog", {
      name: "Delete the example?",
    });
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(
      confirmation.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect(remove).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(
      confirmation.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await page.keyboard.press("Enter");
    await expect(confirmation).toBeHidden();
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('#root[aria-hidden="true"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("a toast takes no focus, is reached with F6 and dismissed with Escape, and the focus goes back", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "Toast", "Show a failure");
    const region = notifications(page);
    const toast = region.getByRole("dialog", { name: "Changes not saved" });
    await expect(region).toHaveAttribute("aria-live", "polite");

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAccessibleDescription("POST /example 500");
    await expect(opener).toBeFocused();

    await page.keyboard.press("F6");
    await expect(region).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(toast).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toast).toBeHidden();
    await expect(opener).toBeFocused();

    // And by its button, whose name shows over the toast.
    await page.keyboard.press("Enter");
    await expect(toast).toBeVisible();
    await page.keyboard.press("F6");
    await page.keyboard.press(tabKey(browserName));
    await page.keyboard.press(tabKey(browserName));
    await expect(toast.getByRole("button", { name: "Dismiss" })).toBeFocused();
    await expect(tooltips(page)).toHaveText("Dismiss");
    await page.keyboard.press("Enter");
    await expect(toast).toBeHidden();
    await expect(opener).toBeFocused();
    expect(problems).toEqual([]);
  });

  // The palette is a dialog of the shell, and its shortcut is the one
  // that works over an open overlay of a view.
  test("the palette opens over the drawer and gives the focus back into it", async ({
    page,
  }) => {
    const problems = await openGallery(page);
    await button(page, "Drawer", "Open drawer").focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Example details" });
    await expect(drawer).toBeFocused();

    await pressPaletteKeys(page);
    await expect(page.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toHaveCount(0);
    await expect(drawer).toBeVisible();
    // Into the drawer: on its first control, since the drawer itself is
    // no stop of the Tab key.
    await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
    expect(problems).toEqual([]);
  });

  // A mouse has a button for Back and a trackpad a swipe, and no dialog
  // can keep either to itself. The dialog of the gallery is rendered by
  // the gallery and goes with it.
  test("the browser's Back closes a dialog of the gallery with the gallery", async ({
    page,
  }) => {
    const problems = await openAt(page, "/nodes");
    await expect(heading(page)).toHaveText("Nodes");
    await pressPaletteKeys(page);
    await page.getByRole("combobox").pressSequentially("gallery");
    await expect(page.getByRole("option", { selected: true })).toHaveText(
      "Open the component gallery",
    );
    await page.keyboard.press("Enter");
    await expect(heading(page)).toHaveText(galleryTitle);
    await expect(heading(page)).toBeFocused();
    await expect(page).toHaveTitle(`${galleryTitle} - sdash`);
    await expect(page.locator("[aria-current]")).toHaveCount(0);

    await button(page, "Dialog", "Open dialog").focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", {
        name: "Example dialog",
        exact: true,
      }),
    ).toBeVisible();

    await page.goBack();

    await expect(heading(page)).toHaveText("Nodes");
    await expect(heading(page)).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('#root[aria-hidden="true"]')).toHaveCount(0);
    // The keys are the page's again.
    await page.keyboard.press("g");
    await page.keyboard.press("j");
    await expect(heading(page)).toHaveText("Jobs");
    expect(problems).toEqual([]);
  });
});

// A modal overlay keeps the Tab key inside by turning it round at its
// edges, which holds while the focus is inside. The pointer takes the
// focus out, and what lies behind the overlay must then be out of reach
// all the same: of the pointer, of the Tab key, and of a screen reader,
// which the page is hidden from.
test.describe("what lies behind a modal overlay", () => {
  /** Whether the focus is on something in the page behind the overlays. */
  function focusBehind(page: Page): Promise<boolean> {
    return page.evaluate(
      () => document.activeElement?.closest("#root") != null,
    );
  }

  /** The middle of a control, taken while it can still be found. */
  async function middleOf(control: Locator): Promise<{ x: number; y: number }> {
    const box = await control.boundingBox();
    if (!box) {
      throw new Error("the control has no place on the page");
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  // The header of the shell stays in sight above the scrim of the drawer,
  // in a layer above the one Base UI catches a press outside with: its
  // controls answered the pointer, and the focus followed the press into a
  // page that is hidden from a screen reader.
  test("the header does not answer under an open drawer, and a press on it closes the drawer", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const opener = button(page, "Drawer", "Open drawer");
    const toggle = page
      .getByRole("banner")
      .getByRole("button", { name: "Dark theme" });
    const onToggle = await middleOf(toggle);
    // Between the search button and the toggle the header holds nothing.
    const beside = { x: onToggle.x - 60, y: onToggle.y };
    const drawerOf = overlays.find(({ name }) => name === "a drawer");
    if (!drawerOf) {
      throw new Error("the gallery has no drawer");
    }
    const theme = await themeOf(page);

    for (const where of [onToggle, beside]) {
      const drawer = await drawerOf.open(page, browserName);
      await expect(page.locator("#root")).toHaveAttribute("inert", "");

      // The pointer rests there first: no tooltip of the header shows.
      await page.mouse.move(where.x, where.y);
      await page.mouse.click(where.x, where.y);

      await expect(drawer).toBeHidden();
      expect(await themeOf(page)).toBe(theme);
      await expect(tooltips(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(page.locator("#root")).not.toHaveAttribute("inert");
    }

    // The premise: with the drawer gone, the toggle answers.
    await page.mouse.click(onToggle.x, onToggle.y);
    expect(await themeOf(page)).not.toBe(theme);
    expect(problems).toEqual([]);
  });

  // A press beside a confirmation is no answer, so the confirmation stays
  // open, and the focus was left on the page: the Tab key then walked the
  // controls behind the scrim, and each of them worked.
  test("a press beside a confirmation leaves the focus on Cancel, and the Tab key inside", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    await button(page, "ConfirmDialog", "Delete example").focus();
    await page.keyboard.press("Enter");
    const confirmation = page.getByRole("alertdialog", {
      name: "Delete the example?",
    });
    const cancel = confirmation.getByRole("button", { name: "Cancel" });
    const confirm = confirmation.getByRole("button", {
      name: "Delete example",
    });
    await expect(cancel).toBeFocused();
    await expect(page.locator("#root")).toHaveAttribute("inert", "");

    // On the scrim, at the left edge of the window.
    await page.mouse.click(15, 500);

    await expect(confirmation).toBeVisible();
    await expect(cancel).toBeFocused();
    await page.keyboard.press(`Shift+${tabKey(browserName)}`);
    await expect(confirm).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(cancel).toBeFocused();
    expect(await focusBehind(page)).toBe(false);
    expect(problems).toEqual([]);
  });

  // A toast lies over an open overlay and stays in reach. Its button takes
  // the focus when the pointer presses it and then goes with the toast,
  // which leaves the focus on the page.
  for (const { name, section: title, opens, shows } of [
    {
      name: "a dialog",
      section: "Dialog",
      opens: "Open dialog",
      shows: { role: "dialog", name: "Example dialog" },
    },
    {
      name: "a confirmation",
      section: "ConfirmDialog",
      opens: "Delete example",
      shows: { role: "alertdialog", name: "Delete the example?" },
    },
    {
      name: "a drawer",
      section: "Drawer",
      opens: "Open drawer",
      shows: { role: "dialog", name: "Example details" },
    },
  ] as const) {
    test(`the Tab key stays out of the page behind ${name} after the pointer dismissed a toast`, async ({
      page,
      browserName,
    }) => {
      const problems = await openGallery(page);
      await button(page, "Toast", "Show a failure").focus();
      await page.keyboard.press("Enter");
      const toast = notifications(page).getByRole("dialog", {
        name: "Changes not saved",
      });
      await expect(toast).toBeVisible();
      await button(page, title, opens).focus();
      await page.keyboard.press("Enter");
      const overlay = page.getByRole(shows.role, { name: shows.name });
      await expect(overlay).toBeVisible();
      await expect(page.locator("#root")).toHaveAttribute("inert", "");

      await toast.getByRole("button", { name: "Dismiss" }).click();
      await expect(toast).toBeHidden();
      await expect(overlay).toBeVisible();

      // Backwards and forwards: never on a control of the page.
      for (const key of [
        `Shift+${tabKey(browserName)}`,
        `Shift+${tabKey(browserName)}`,
        tabKey(browserName),
        tabKey(browserName),
        tabKey(browserName),
      ]) {
        await page.keyboard.press(key);
        expect(await focusBehind(page), key).toBe(false);
      }
      // And the Tab key has brought the focus back into the overlay.
      await expect
        .poll(() =>
          overlay.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      expect(problems).toEqual([]);
    });
  }

  // Escape with the focus in a toast dismisses that toast. The overlay
  // beside it hears the same key on the page: a form would be lost and a
  // confirmation cancelled by a key that was meant for a message.
  test("Escape on a toast dismisses the toast and leaves the dialog beside it open", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    await button(page, "Toast", "Show a failure").focus();
    await page.keyboard.press("Enter");
    const region = notifications(page);
    const toast = region.getByRole("dialog", { name: "Changes not saved" });
    await expect(toast).toBeVisible();
    await button(page, "Dialog", "Open dialog").focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Example dialog" });
    const field = dialog.getByRole("textbox", { name: "Dialog name" });
    await expect(field).toBeFocused();

    await page.keyboard.press("F6");
    await expect(region).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(toast).toBeFocused();
    await page.keyboard.press("Escape");

    await expect(toast).toBeHidden();
    await expect(dialog).toBeVisible();
    // Back where it was before F6, and the next Escape is the dialog's.
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(problems).toEqual([]);
  });
});

// Base UI swipes a toast away under a pointer that is dragged over it, a
// mouse too. A drag over a text selects it, and the toast has a button
// that dismisses it: so it is told not to.
test("a drag over a toast leaves the toast where it is", async ({
  page,
  browserName,
}) => {
  const problems = await openGallery(page);
  const toastOf = overlays.find(({ name }) => name === "a toast");
  if (!toastOf) {
    throw new Error("the gallery has no toast");
  }
  const toast = await toastOf.open(page, browserName);
  const before = await toast.boundingBox();
  if (!before) {
    throw new Error("the toast has no place on the page");
  }
  const y = before.y + before.height / 2;

  // To the right and then downwards, the two ways Base UI swipes a toast
  // away unless it is told otherwise.
  for (const [across, down] of [
    [200, 0],
    [0, 40],
  ] as const) {
    await page.mouse.move(before.x + 30, y);
    await page.mouse.down();
    await page.mouse.move(before.x + 30 + across, y + down, { steps: 8 });
    await page.mouse.up();
  }

  await expect(toast).toBeVisible();
  expect(await toast.boundingBox()).toEqual(before);
  expect(problems).toEqual([]);
});

// What a finger does. A touch screen has no key and no pointer that rests:
// a drawer is closed there by a swipe towards the edge it came from.
test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } });
  // Playwright can tap and cannot swipe. The swipe is sent through the
  // DevTools protocol, which of the three engines only Chromium speaks.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "a swipe is sent through the DevTools protocol of Chromium",
  );

  /** One finger down at `from`, across to `to`, and up. */
  async function swipe(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> {
    const session = await page.context().newCDPSession(page);
    const steps = 10;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    for (let step = 1; step <= steps; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * step) / steps,
            y: from.y + ((to.y - from.y) * step) / steps,
          },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  }

  test("a swipe to the right closes the drawer, and one in another direction does not", async ({
    page,
    browserName,
  }) => {
    const problems = await openGallery(page);
    const drawerOf = overlays.find(({ name }) => name === "a drawer");
    if (!drawerOf) {
      throw new Error("the gallery has no drawer");
    }
    const drawer = await drawerOf.open(page, browserName);
    const title = await drawer
      .getByRole("heading", { name: "Example details" })
      .boundingBox();
    if (!title) {
      throw new Error("the drawer shows no title");
    }
    const start = { x: 60, y: title.y + title.height / 2 };

    await swipe(page, { x: 330, y: start.y }, start);
    await expect(drawer).toBeVisible();

    await swipe(page, start, { x: 330, y: start.y });
    await expect(drawer).toBeHidden();
    expect(problems).toEqual([]);
  });
});

// The automated part of the accessibility target for the primitives: the
// axe scan of the gallery in each state that has content or colours of
// its own (doc/adr/0014-accessibility-and-browsers.md).
for (const theme of ["light", "dark"] as const) {
  test.describe(`in the ${theme} theme`, () => {
    // Without a stored choice the page takes the theme the system prefers.
    test.use({ colorScheme: theme });
    // The gallery is the largest page there is, and a scan of it takes
    // seconds where one of a view takes a fraction of one. No test here
    // scans more than four times, and each has twice the usual time for
    // it, so that a slow machine fails none of them by the clock.
    test.describe.configure({ timeout: 60_000 });

    /** Opens the gallery in the theme of the block. */
    async function openInTheme(page: Page): Promise<string[]> {
      const problems = await openGallery(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      return problems;
    }

    for (const overlay of overlays) {
      test(`the gallery with ${overlay.name} open passes the axe scan`, async ({
        page,
        browserName,
      }) => {
        const problems = await openInTheme(page);
        const shown = await overlay.open(page, browserName);
        await expect(shown).toBeVisible();

        expect(await scan(page)).toEqual([]);
        expect(problems).toEqual([]);
      });
    }

    // What opens from inside a dialog lies inside that dialog, and not
    // beside it at the end of the page, where it would be in no landmark.
    test("the list of a select and a tooltip that open from inside a dialog pass the axe scan", async ({
      page,
      browserName,
    }) => {
      const problems = await openInTheme(page);
      await button(page, "Dialog", "Open dialog").focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: "Example dialog",
        exact: true,
      });
      const choice = dialog.getByRole("combobox", { name: "Dialog choice" });
      await choice.focus();
      await page.keyboard.press("Enter");
      await expect(dialog.getByRole("listbox")).toBeVisible();
      expect(await scan(page)).toEqual([]);

      await page.keyboard.press("Escape");
      await tabTo(
        page,
        browserName,
        choice,
        dialog.getByRole("button", { name: "Search in the dialog" }),
      );
      await expect(tooltips(page)).toHaveText("Search in the dialog");
      expect(await scan(page)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("the list of a select in a popover, and the reason of a disabled entry in a menu, pass the axe scan", async ({
      page,
    }) => {
      const problems = await openInTheme(page);
      await press(page, button(page, "Popover", "Example settings"));
      const popover = page.getByRole("dialog", { name: "Example settings" });
      await popover.getByRole("combobox", { name: "Settings choice" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();

      await press(page, button(page, "Menu", "Actions"));
      const menu = page.getByRole("menu", { name: "Actions" });
      await expect(
        menu.getByRole("menuitem", { name: "First action" }),
      ).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("tooltip").filter({ visible: true }),
      ).toHaveText(/nothing for the second action/);
      expect(await scan(page)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("what opens from inside the drawer passes the axe scan: the tooltip of its button, the list of a select, and a confirmation", async ({
      page,
      browserName,
    }) => {
      const problems = await openInTheme(page);
      await button(page, "Drawer", "Open drawer").focus();
      await page.keyboard.press("Enter");
      const drawer = page.getByRole("dialog", { name: "Example details" });
      await expect(drawer).toBeFocused();
      await page.keyboard.press(tabKey(browserName));
      await expect(tooltips(page)).toHaveText("CloseEsc");
      expect(await scan(page)).toEqual([]);

      await page.keyboard.press("Escape");
      await drawer.getByRole("tab", { name: "Summary" }).focus();
      await page.keyboard.press("ArrowRight");
      await drawer.getByRole("combobox", { name: "Drawer choice" }).focus();
      await page.keyboard.press("Enter");
      await expect(drawer.getByRole("listbox")).toBeVisible();
      expect(await scan(page)).toEqual([]);

      await page.keyboard.press("Escape");
      await drawer.getByRole("button", { name: "Delete example" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("the other dialogs and confirmations pass the axe scan", async ({
      page,
    }) => {
      const problems = await openInTheme(page);

      // A dialog whose body scrolls and is a stop of the Tab key.
      await button(page, "Dialog", "Open long dialog").focus();
      await page.keyboard.press("Enter");
      const long = page.getByRole("dialog", { name: "Long example dialog" });
      await expect(long.getByRole("button", { name: "Close" })).toBeFocused();
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(long).toBeHidden();

      // The destructive confirmation, in the colours of an error.
      await button(page, "ConfirmDialog", "Delete example").focus();
      await page.keyboard.press("Enter");
      const remove = page.getByRole("alertdialog", {
        name: "Delete the example?",
      });
      await expect(
        remove.getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(remove).toBeHidden();

      // The one with an input, and a button that cannot be used yet.
      await button(page, "ConfirmDialog", "Rename example").focus();
      await page.keyboard.press("Enter");
      const rename = page.getByRole("alertdialog", {
        name: "Rename the example?",
      });
      await expect(
        rename.getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);

      expect(problems).toEqual([]);
    });

    test("the toasts of every tone, and the region with the focus in it, pass the axe scan", async ({
      page,
      browserName,
    }) => {
      const problems = await openInTheme(page);
      for (const name of [
        "Show a success",
        "Show a note",
        "Show a warning",
        "Show a failure",
      ]) {
        await button(page, "Toast", name).focus();
        await page.keyboard.press("Enter");
      }
      const region = notifications(page);
      await expect(region.getByRole("dialog")).toHaveCount(4);
      // With the focus in the region the toasts stay, however long the
      // scan takes.
      await page.keyboard.press("F6");
      await expect(region).toBeFocused();
      expect(await scan(page)).toEqual([]);

      // The button of a toast, with its name showing.
      await page.keyboard.press(tabKey(browserName));
      await page.keyboard.press(tabKey(browserName));
      await expect(tooltips(page)).toHaveText("Dismiss");
      expect(await scan(page)).toEqual([]);
      await expect(region.getByRole("dialog")).toHaveCount(4);
      expect(problems).toEqual([]);
    });

    // The marked entry of a list has the hover background, and an entry
    // that is disabled is dimmed: colours a list at rest does not have.
    test("the entries of a select and of a menu that the arrow keys reach pass the axe scan", async ({
      page,
    }) => {
      const problems = await openInTheme(page);
      await section(page, "Select")
        .getByRole("combobox", { name: "Chosen example" })
        .focus();
      await page.keyboard.press("Enter");
      const list = page.getByRole("listbox", { name: "Chosen example" });
      // It opens on the chosen option, which shows its tick.
      await expect(
        list.getByRole("option", { name: "Second option" }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("ArrowDown");
      await expect(
        list.getByRole("option", { name: "Third option" }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(list).toBeHidden();

      await button(page, "Menu", "Actions").focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: "Actions" });
      // The menu takes the focus in an animation frame after it has
      // opened, and a key sent before that is still the button's.
      await expect(
        menu.getByRole("menuitem", { name: "First action" }),
      ).toBeFocused();
      await page.keyboard.press("End");
      await expect(
        menu.getByRole("menuitem", { name: "Delete example" }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await expect(
        menu.getByRole("menuitemradio", { name: /First order/ }),
      ).toBeFocused();
      expect(await scan(page)).toEqual([]);

      expect(problems).toEqual([]);
    });

    // The ring of the focus is a colour of its own on each control, and a
    // control under the pointer has a look no page at rest shows. A scan
    // sees one control with the focus and one under the pointer at a
    // time, so they are scanned in pairs, a few to a test.
    const states: Record<
      string,
      (page: Page) => { focused: Locator; hovered: Locator }[]
    > = {
      buttons: (page) => [
        {
          focused: button(page, "Button", "Save changes"),
          hovered: button(page, "Button", "Cancel"),
        },
        {
          focused: button(page, "Button", "Remove example"),
          hovered: button(page, "Button", "Show details"),
        },
        {
          // Disabled with a reason, which shows as its tooltip.
          focused: button(page, "Button", "Save nothing"),
          hovered: button(page, "Button", "Delete example"),
        },
        {
          focused: button(page, "Button", "Discard changes"),
          hovered: button(page, "Button", "Save changes"),
        },
      ],
      "toggles and chips": (page) => [
        {
          focused: button(page, "IconButton", "Mark example"),
          hovered: button(page, "IconButton", "Remove example"),
        },
        {
          // Pressed, disabled, and still a stop of the Tab key.
          focused: button(page, "IconButton", "Lock nothing"),
          hovered: button(page, "Chip", "Second filter"),
        },
        {
          // A pressed chip, with the focus and under the pointer at once.
          focused: button(page, "Chip", "First filter"),
          hovered: button(page, "Chip", "First filter"),
        },
      ],
      "fields, segments and tabs": (page) => [
        {
          focused: section(page, "Input").getByRole("textbox", {
            name: "Required name",
          }),
          hovered: section(page, "SegmentedControl")
            .getByRole("radio", { name: "Third range" })
            .first(),
        },
        {
          focused: section(page, "Input").getByRole("textbox", {
            name: "Example id",
          }),
          hovered: section(page, "Tabs")
            .getByRole("tab", { name: "Fourth tab" })
            .first(),
        },
        {
          focused: section(page, "Select").getByRole("combobox", {
            name: "Required choice",
          }),
          hovered: button(page, "Button", "Remove example"),
        },
        {
          focused: section(page, "SegmentedControl")
            .getByRole("radio", { name: "First range" })
            .first(),
          hovered: section(page, "Tabs")
            .getByRole("tab", { name: "First tab" })
            .last(),
        },
      ],
    };
    for (const [kind, pairs] of Object.entries(states)) {
      test(`${kind} with the focus on them, and under the pointer, pass the axe scan`, async ({
        page,
        browserName,
      }) => {
        const problems = await openInTheme(page);
        for (const { focused, hovered } of pairs(page)) {
          // By the Tab key, so that the ring shows: from the control
          // before, whichever that is.
          await focused.focus();
          await page.keyboard.press(`Shift+${tabKey(browserName)}`);
          await page.keyboard.press(tabKey(browserName));
          await expect(focused).toBeFocused();
          await hovered.hover();
          expect(await scan(page)).toEqual([]);
        }
        expect(problems).toEqual([]);
      });
    }

    // A tab that is disabled is reached by the arrow keys: its text is
    // dimmed and its ring is not.
    test("a disabled tab with the focus on it passes the axe scan", async ({
      page,
    }) => {
      const problems = await openInTheme(page);
      const tabs = section(page, "Tabs").getByRole("tablist").last();
      await tabs.getByRole("tab", { name: "First tab" }).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(tabs.getByRole("tab", { name: "Third tab" })).toBeFocused();

      expect(await scan(page)).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}
