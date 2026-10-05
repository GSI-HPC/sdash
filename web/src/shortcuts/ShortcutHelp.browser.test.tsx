// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { views } from "../routing/views";
import { pressModK, renderApp, resetPage } from "../testing/app";
import { isApplePlatform } from "./keys";
import { storageKey } from "./ShortcutsProvider";

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

type Screen = Awaited<ReturnType<typeof renderApp>>;

/** Renders the application and opens the help by its key. */
async function openHelp(): Promise<Screen> {
  const screen = await renderApp("/overview");
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeVisible();
  await userEvent.keyboard("?");
  await expect
    .element(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
    .toBeVisible();
  return screen;
}

/** The lines of the help: what each shortcut does, and its keys in words. */
function lines(screen: Screen, group: string): string[] {
  const terms = screen
    .getByRole("region", { name: group })
    .element()
    .querySelectorAll("dt");
  return [...terms].map((term) => {
    const keys = term.nextElementSibling?.querySelector(".sr-only");
    return `${term.textContent}: ${keys?.textContent ?? ""}`;
  });
}

describe("the help dialog", () => {
  // The help shows what the registry holds. A shortcut that exists is
  // listed, and one that is listed exists.
  test("lists the shell's shortcuts, with their keys in words for a screen reader", async () => {
    const screen = await openHelp();

    // The application reads the platform of the machine the test runs on,
    // and names the modifier that machine has.
    const modifier = isApplePlatform(navigator.platform)
      ? "Command"
      : "Control";
    expect(lines(screen, "General")).toEqual([
      `Open the command palette: ${modifier} K`,
      "Show the keyboard shortcuts: question mark",
      "Switch the theme: t",
      "Collapse or expand the sidebar: left square bracket",
      "Close the open dialog: Escape",
    ]);
    expect(lines(screen, "Go to")).toEqual(
      views.map((view) => `${view.title}: g then ${view.goKey}`),
    );
  });

  test("takes the focus and gives it back on Escape", async () => {
    const screen = await renderApp("/overview");
    const link = screen.getByRole("link", { name: "Diagnostics" });
    link.element().focus();

    await userEvent.keyboard("?");
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(dialog).toBeVisible();
    await expect
      .poll(() => dialog.element().contains(document.activeElement))
      .toBe(true);

    await userEvent.keyboard("{Escape}");
    await expect.element(link).toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });

  test("closes by its button", async () => {
    const screen = await openHelp();

    await screen.getByRole("button", { name: "Close" }).click();

    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });

  // The page behind the dialog is not there to the user. "g" and "n" must
  // not swap it under the dialog, and "t" must not change the theme.
  test("keeps the character keys from the page behind it", async () => {
    const screen = await openHelp();

    await userEvent.keyboard("gnt");

    await expect
      .element(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { level: 1, includeHidden: true }))
      .toHaveTextContent("Overview");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  // One dialog at a time: the palette takes the place of the help.
  test("gives way to the palette", async () => {
    const screen = await openHelp();

    await pressModK();

    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toHaveLength(1);
  });

  // The way to the help for whoever has the "?" key switched off, and the
  // focus still finds its way back past both dialogs.
  test("opens from the palette, and closing it gives the focus back to where it was before", async () => {
    const screen = await renderApp("/overview");
    const link = screen.getByRole("link", { name: "Partitions" });
    link.element().focus();

    await pressModK();
    await userEvent.keyboard("keyboard{Enter}");
    await expect
      .element(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(link).toHaveFocus();
  });
});

describe("the switch in the help dialog", () => {
  // WCAG 2.1, success criterion 2.1.4. The switch is where the shortcuts
  // are listed, so whoever looks for it finds it.
  test("switches the single-key shortcuts off, says which are off, and keeps the choice", async () => {
    const screen = await openHelp();
    const toggle = screen.getByRole("checkbox", {
      name: "Single-key shortcuts",
    });
    await expect.element(toggle).toBeChecked();
    await expect
      .element(toggle)
      .toHaveAccessibleDescription(/need no Ctrl or Command key/);

    await toggle.click();

    await expect.element(toggle).not.toBeChecked();
    expect(localStorage.getItem(storageKey)).toBe("off");
    // Every line of a switched-off shortcut says so, in text and not by
    // its colour alone. The two that stay do not.
    const rows = (group: string) =>
      [
        ...screen
          .getByRole("region", { name: group })
          .element()
          .querySelectorAll("dd"),
      ].map((keys) => keys.textContent.includes("switched off"));
    expect(rows("General")).toEqual([false, true, true, true, false]);
    expect(rows("Go to")).toEqual(views.map(() => true));

    await userEvent.keyboard("{Escape}");
    await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);

    // Off: none of the character keys does anything. That is asked once
    // a later key has been seen to act, since it holds of any page that
    // has not got to the keys yet. The key is Tab, which reaches the skip
    // link only if no dialog has opened and no view was arrived at.
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("?tgn");
    await userEvent.tab();
    await expect
      .element(screen.getByRole("link", { name: "Skip to main content" }))
      .toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
    expect(document.documentElement.dataset.theme).toBe("light");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Overview");

    // The palette still opens, and Escape still closes it.
    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });

  // A control must not advertise keys that do nothing.
  test("takes the switched-off keys off the controls that show them", async () => {
    localStorage.setItem(storageKey, "off");
    const screen = await renderApp("/overview");

    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    await expect.element(collapse).not.toHaveAttribute("aria-keyshortcuts");
    expect(collapse.element().querySelector("kbd")).toBeNull();

    // The palette's shortcut has a modifier and stays.
    const search = screen.getByRole("button", {
      name: "Search views and actions",
    });
    await expect.element(search).toHaveAttribute("aria-keyshortcuts");
    expect(search.element().querySelector("kbd")).not.toBeNull();
  });
});
