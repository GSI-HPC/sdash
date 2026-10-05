// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { views } from "../routing/views";
import { storageKey as characterKeysKey } from "../shortcuts/ShortcutsProvider";
import { pressModK, renderApp, resetPage, settled } from "../testing/app";

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

type Screen = Awaited<ReturnType<typeof renderApp>>;

/** Renders the application and opens the palette by its shortcut. */
async function openPalette(address = "/overview"): Promise<Screen> {
  const screen = await renderApp(address);
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeVisible();
  await pressModK();
  await expect.element(screen.getByRole("combobox")).toHaveFocus();
  return screen;
}

/** The label of the entry the marker is on, as the text field reports it. */
function marked(screen: Screen): string | null {
  const id = screen
    .getByRole("combobox")
    .element()
    .getAttribute("aria-activedescendant");
  const option = id === null ? null : document.getElementById(id);
  if (option?.getAttribute("aria-selected") !== "true") {
    return null;
  }
  return option.firstElementChild?.textContent ?? null;
}

/** The label of an entry, without the keys beside it. */
function labelOf(option: Element): string | null {
  return option.firstElementChild?.textContent ?? null;
}

describe("the command palette", () => {
  // The names and the relations a screen reader needs to present a text
  // field with a list of suggestions (the combobox pattern of the ARIA
  // Authoring Practices).
  test("opens as a dialog whose text field controls a list box", async () => {
    const screen = await openPalette();

    await expect
      .element(screen.getByRole("dialog", { name: "Command palette" }))
      .toBeVisible();
    const field = screen.getByRole("combobox", {
      name: "Search views and actions",
    });
    await expect.element(field).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", { name: "Views and actions" });
    await expect
      .element(field)
      .toHaveAttribute("aria-controls", list.element().id);
  });

  test("lists every view and the shell's actions under their headings", async () => {
    const screen = await openPalette();
    const labels = (group: string) =>
      screen
        .getByRole("group", { name: group })
        .getByRole("option")
        .elements()
        .map((option) => option.firstElementChild?.textContent);

    expect(labels("Views")).toEqual(views.map((view) => view.title));
    expect(labels("Actions")).toEqual([
      "Switch to the dark theme",
      "Collapse the sidebar",
      "Show the keyboard shortcuts",
      "Open the component gallery",
      "Switch single-key shortcuts off",
    ]);
  });

  test("opens from the button in the header too", async () => {
    const screen = await renderApp("/overview");

    await screen
      .getByRole("button", { name: "Search views and actions" })
      .click();

    await expect.element(screen.getByRole("combobox")).toHaveFocus();
  });

  // The marker is on the first entry until the user moves it, so Enter
  // right after typing takes the best match.
  test("moves its marker with the arrow keys, Home and End", async () => {
    const screen = await openPalette();
    const last = "Switch single-key shortcuts off";
    expect(marked(screen)).toBe("Overview");

    await userEvent.keyboard("{ArrowDown}");
    expect(marked(screen)).toBe("Nodes");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{ArrowUp}");
    expect(marked(screen)).toBe("Overview");

    // Past either end the marker comes round to the other.
    await userEvent.keyboard("{ArrowUp}");
    expect(marked(screen)).toBe(last);
    await userEvent.keyboard("{ArrowDown}");
    expect(marked(screen)).toBe("Overview");

    await userEvent.keyboard("{End}");
    expect(marked(screen)).toBe(last);
    await userEvent.keyboard("{Home}");
    expect(marked(screen)).toBe("Overview");

    // The focus has been in the text field all along.
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
  });

  // The entry the marker is on has to be seen, in a list longer than its
  // box.
  test("scrolls the marked entry into view", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("{End}");

    await expect
      .element(
        screen.getByRole("option", { name: "Switch single-key shortcuts off" }),
      )
      .toBeInViewport();
  });

  // The pointer marks the entry it is over, and that entry may be one the
  // edge of the list cuts off. Scrolled into view like an entry the
  // keyboard reached, it would slide away under the pointer, which would
  // then be over the next one.
  test("does not scroll when the pointer marks an entry the edge of the list cuts off", async () => {
    const screen = await openPalette();
    // Off the list: the tests of this file share one pointer.
    await screen.getByRole("combobox").hover();
    const list = screen.getByRole("listbox").element();
    const edge = list.getBoundingClientRect().bottom;
    const options = screen.getByRole("option").elements();
    const at = options.findIndex(
      (option) => option.getBoundingClientRect().bottom > edge,
    );
    const [cut, next] = [options[at], options[at + 1]];
    if (!cut || !next) {
      throw new Error("the list is not longer than its box");
    }
    // The edge through the middle of the entry.
    const box = cut.getBoundingClientRect();
    list.scrollTop += Math.round(box.top + box.height / 2 - edge);
    await settled();
    const before = list.scrollTop;
    // The premise: the entry is in view in part and not in full.
    expect(cut.getBoundingClientRect().top).toBeLessThan(edge);
    expect(cut.getBoundingClientRect().bottom).toBeGreaterThan(edge);

    cut.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));

    await expect.poll(() => marked(screen)).toBe(labelOf(cut));
    await settled();
    expect(list.scrollTop).toBe(before);

    // The keyboard still brings the entry it marks into view in full.
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => marked(screen)).toBe(labelOf(next));
    await expect
      .poll(() => next.getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(edge);
    expect(list.scrollTop).toBeGreaterThan(before);
  });

  // Typing is the keyboard too: the marker goes back to the first entry,
  // which has to be seen though the list was scrolled to its end.
  test("scrolls back to the first entry when the query changes", async () => {
    const screen = await openPalette();
    await userEvent.keyboard("{End}");
    const list = screen.getByRole("listbox").element();
    await expect.poll(() => list.scrollTop).toBeGreaterThan(0);

    // A query that leaves a list longer than its box.
    await userEvent.keyboard("s");

    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    await expect.poll(() => list.scrollTop).toBe(0);
    await expect
      .element(screen.getByRole("option", { selected: true }))
      .toBeInViewport();
  });

  test("narrows the list as the user types and marks the best match", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("history");

    await expect
      .element(screen.getByRole("option", { name: "Job history" }))
      .toBeVisible();
    expect(screen.getByRole("option").elements()).toHaveLength(1);
    expect(marked(screen)).toBe("Job history");
    // A screen reader is told how many entries are left.
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("1 match");
  });

  // The marker the user moved belongs to the list they moved it in. A new
  // query is a new list, best match first, and Enter has to take that
  // one, though the entry marked before is still in the list.
  test("puts its marker back on the best match when the query changes", async () => {
    const screen = await openPalette();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(marked(screen)).toBe("Partitions");

    await userEvent.keyboard("o");

    await expect
      .element(screen.getByRole("option", { name: "Partitions" }))
      .toBeVisible();
    expect(marked(screen)).toBe("Overview");
    expect(
      screen.getByRole("option").first().element().firstElementChild
        ?.textContent,
    ).toBe("Overview");
  });

  // A view is also found by a word its title does not hold.
  test("finds a view by a keyword", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("squeue");

    expect(marked(screen)).toBe("Jobs");
  });

  test("goes to the marked view on Enter and puts the focus on its heading", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("nod{Enter}");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
    expect(document.title).toBe("Nodes - sdash");
  });

  test("goes to a view on a click", async () => {
    const screen = await openPalette();

    await screen.getByRole("option", { name: "Partitions" }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Partitions" }))
      .toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });

  test("marks the entry under the pointer", async () => {
    const screen = await openPalette();

    await screen.getByRole("option", { name: "Jobs", exact: true }).hover();

    await expect.poll(() => marked(screen)).toBe("Jobs");
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
  });

  // A press on the list that chooses nothing, on a heading or between
  // two entries, must not take the focus out of the text field: the keys
  // would stop working with the palette still open.
  test("keeps the focus in the text field when the list is pressed", async () => {
    const screen = await openPalette();

    await screen
      .getByRole("listbox")
      .getByText("Actions", { exact: true })
      .click();

    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("nod");
    await expect.element(screen.getByRole("combobox")).toHaveValue("nod");
  });

  test("runs an action and closes", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("dark{Enter}");

    await expect
      .poll(() => document.documentElement.dataset.theme)
      .toBe("dark");
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
    // The toggle in the header shows the theme whoever changed it.
    await expect
      .element(screen.getByRole("button", { name: "Dark theme" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  // The way to the switch for whoever cannot use the "?" key, which is
  // one of the shortcuts the switch is for.
  test("switches the single-key shortcuts off and on", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("single{Enter}");
    await expect.poll(() => localStorage.getItem(characterKeysKey)).toBe("off");

    // "t" does nothing now; the palette still opens. That it has opened
    // shows that the page got to both keys, and only then is the theme
    // asked for.
    await userEvent.keyboard("t");
    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.keyboard("single");
    await expect
      .element(
        screen.getByRole("option", { name: "Switch single-key shortcuts on" }),
      )
      .toBeVisible();
  });

  // An empty list box is no list box: the field then controls nothing,
  // and the user is told in words.
  test("says so when nothing matches", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("zzz");

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("No view or action matches.");
    await expect.element(screen.getByRole("status")).toBeVisible();
    const field = screen.getByRole("combobox");
    await expect.element(field).toHaveAttribute("aria-expanded", "false");
    await expect.element(field).not.toHaveAttribute("aria-controls");
    await expect.element(field).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("listbox").elements()).toHaveLength(0);

    // Enter has nothing to choose and leaves the palette open.
    await userEvent.keyboard("{Enter}");
    await expect.element(field).toHaveFocus();
  });
});

describe("closing the palette", () => {
  // The focus goes back to where the user was, or they would have to find
  // their place again after every look into the palette.
  test("with Escape gives the focus back to the element that had it", async () => {
    const screen = await renderApp("/overview");
    const link = screen.getByRole("link", { name: "Reservations" });
    link.element().focus();

    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    await expect.element(link).toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });

  test("with its shortcut gives the focus back too", async () => {
    const screen = await renderApp("/overview");
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    toggle.element().focus();

    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    await pressModK();

    await expect.element(toggle).toHaveFocus();
  });

  test("with its close button", async () => {
    const screen = await openPalette();

    await screen
      .getByRole("button", { name: "Esc to close", exact: true })
      .click();

    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });

  // WCAG 2.1, success criterion 2.5.3: someone who speaks to the computer
  // says what a control shows, "click Esc", and the control answers to it
  // only if that text is in its name. The button shows the key and
  // nothing else.
  test("its close button has the key it shows at the start of its name", async () => {
    const screen = await openPalette();
    const close = screen.getByRole("dialog").getByRole("button");
    const cap = close.element().querySelector("kbd");

    await expect.element(cap).toBeVisible();
    expect(cap?.textContent).toBe("Esc");
    // In the name by being read, not by a label that repeats it.
    expect(cap?.closest("[aria-hidden]")).toBeNull();
    expect(close.element().hasAttribute("aria-label")).toBe(false);
    await expect.element(close).toHaveAccessibleName("Esc to close");
  });

  // The query of the last time would be in the way of the next search.
  test("forgets the query", async () => {
    const screen = await openPalette();
    await userEvent.keyboard("hist{Escape}");

    await pressModK();

    await expect.element(screen.getByRole("combobox")).toHaveValue("");
    expect(marked(screen)).toBe("Overview");
  });
});

describe("while the palette is open", () => {
  // Typing "g" and "n" into the text field searches for "gn". It must not
  // leave the view behind the palette.
  test("the keys typed into it are text and not shortcuts", async () => {
    const screen = await openPalette();

    await userEvent.keyboard("gnt?");

    await expect.element(screen.getByRole("combobox")).toHaveValue("gnt?");
    await expect
      .element(screen.getByRole("heading", { level: 1, includeHidden: true }))
      .toHaveTextContent("Overview");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  // The Tab key stays inside a modal dialog: the page behind it is not
  // there to a keyboard user.
  test("the Tab key stays inside it", async () => {
    const screen = await openPalette();
    const dialog = screen.getByRole("dialog").element();

    for (let presses = 0; presses < 4; presses++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
