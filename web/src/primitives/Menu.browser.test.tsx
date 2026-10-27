// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { settled } from "../testing/app";
import { colourOf } from "../testing/colours";
import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { forceColours } from "../testing/system";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { Button } from "./Button";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "./Menu";
import { PopupContainer } from "./popups";
import { Tooltip } from "./Tooltip";

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1280, 720);
});

// The tests of a file share one page, and one of them has the system
// force its colours.
afterEach(async () => {
  await forceColours(false);
});

/**
 * A menu with a group of actions, one of them disabled, a choice of two,
 * and a destructive action. `ran` is told what was chosen.
 */
function Page({ ran }: { ran: string[] }) {
  const [choice, setChoice] = useState<"first" | "second">("first");
  return (
    <Menu trigger={<Button iconEnd="chevronDown">Actions</Button>}>
      <MenuGroup label="Example actions">
        <MenuItem onClick={() => ran.push("first")}>First action</MenuItem>
        <MenuItem disabled onClick={() => ran.push("second")}>
          Second action
        </MenuItem>
        <MenuItem onClick={() => ran.push("third")}>Third action</MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuRadioGroup
        label="Example choice"
        value={choice}
        onValueChange={(next) => {
          ran.push(`choice: ${next}`);
          setChoice(next);
        }}
      >
        <MenuRadioItem value="first" detail="every 5 seconds">
          First option
        </MenuRadioItem>
        <MenuRadioItem value="second">Second option</MenuRadioItem>
      </MenuRadioGroup>
      <MenuSeparator />
      <MenuItem tone="danger" onClick={() => ran.push("delete")}>
        Delete example
      </MenuItem>
    </Menu>
  );
}

/** Renders the page and puts the focus on the button of the menu. */
async function renderFocused(ran: string[] = []) {
  const screen = await render(<Page ran={ran} />);
  const trigger = screen.getByRole("button", { name: "Actions" });
  trigger.element().focus();
  return { screen, trigger };
}

test.each(["{Enter}", "{ArrowDown}", " "])(
  "opens from its trigger by the key %s with the first entry focused",
  async (key) => {
    const { screen, trigger } = await renderFocused();
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.keyboard(key);

    await expect
      .element(screen.getByRole("menuitem", { name: "First action" }))
      .toHaveFocus();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    // The button names the menu it opens.
    await expect
      .element(screen.getByRole("menu", { name: "Actions" }))
      .toBeVisible();
  },
);

test("moves with the arrow keys, Home, End and a letter", async () => {
  const { screen } = await renderFocused();
  await userEvent.keyboard("{Enter}");
  const first = screen.getByRole("menuitem", { name: "First action" });
  const third = screen.getByRole("menuitem", { name: "Third action" });
  const last = screen.getByRole("menuitem", { name: "Delete example" });
  await expect.element(first).toHaveFocus();

  await userEvent.keyboard("{End}");
  await expect.element(last).toHaveFocus();
  await userEvent.keyboard("{ArrowUp}");
  await expect
    .element(screen.getByRole("menuitemradio", { name: /Second option/ }))
    .toHaveFocus();
  await userEvent.keyboard("{Home}");
  await expect.element(first).toHaveFocus();
  await userEvent.keyboard("t");
  await expect.element(third).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect
    .element(screen.getByRole("menuitemradio", { name: /First option/ }))
    .toHaveFocus();
});

// The marked entry has the real focus, so the ring of the keyboard focus
// is what marks it, in a contrast theme of the system too.
test("draws the ring of the focus on the marked entry, inside its edge", async () => {
  const { screen } = await renderFocused();
  await userEvent.keyboard("{Enter}");
  const first = screen.getByRole("menuitem", { name: "First action" });
  await expect.element(first).toHaveFocus();

  const style = getComputedStyle(first.element());
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("2px");
  expect(style.outlineOffset).toBe("-2px");
});

test("runs the entry Enter chooses, closes and gives the focus back", async () => {
  const ran: string[] = [];
  const { screen, trigger } = await renderFocused(ran);
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("menuitem", { name: "First action" }))
    .toHaveFocus();

  await userEvent.keyboard("t");
  await expect
    .element(screen.getByRole("menuitem", { name: "Third action" }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");

  expect(ran).toEqual(["third"]);
  await expect.poll(() => screen.getByRole("menu").elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();
});

test("runs the entry a press chooses", async () => {
  const ran: string[] = [];
  const { screen, trigger } = await renderFocused(ran);
  await trigger.click();

  await screen.getByRole("menuitem", { name: "Delete example" }).click();

  expect(ran).toEqual(["delete"]);
  await expect.poll(() => screen.getByRole("menu").elements()).toEqual([]);
});

test("closes on Escape without running anything", async () => {
  const ran: string[] = [];
  const { screen, trigger } = await renderFocused(ran);
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("menuitem", { name: "First action" }))
    .toHaveFocus();

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("menu").elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();
  expect(ran).toEqual([]);
});

// The menu is modal: the page does not answer the pointer while it is
// open, so the press that closes it lands on nothing behind it.
test("closes on a press outside", async () => {
  const ran: string[] = [];
  const { screen } = await renderFocused(ran);
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("menu")).toBeVisible();

  // On the page as a whole, at a point where the menu is not: what the
  // pointer meets there is the menu's own cover over the page.
  await userEvent.click(document.body, { position: { x: 1000, y: 600 } });

  await expect.poll(() => screen.getByRole("menu").elements()).toEqual([]);
  expect(ran).toEqual([]);
});

// The arrow keys do not pass over an entry that is disabled: a user of a
// screen reader then learns that the action exists and cannot be taken
// now, as the WAI-ARIA practices for a menu recommend.
test("reaches an entry that is disabled, which says so and does nothing when chosen", async () => {
  const ran: string[] = [];
  const { screen } = await renderFocused(ran);
  await userEvent.keyboard("{Enter}");
  const second = screen.getByRole("menuitem", { name: "Second action" });
  await expect.element(second).toHaveAttribute("aria-disabled", "true");

  // Its text is dimmed and the entry is not: opacity on the entry would
  // dim the ring of its focus with it, to 1.8:1 in the light theme.
  const text = second.element().firstElementChild;
  expect(text && getComputedStyle(text).opacity).toBe("0.45");
  expect(getComputedStyle(second.element()).opacity).toBe("1");

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(second).toHaveFocus();
  expect(getComputedStyle(second.element()).outlineColor).toBe(
    colourOf("--focus"),
  );
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard(" ");
  await settled();
  expect(ran).toEqual([]);
  expect(screen.getByRole("menu").elements()).toHaveLength(1);

  // A press does nothing either, and the menu stays.
  await userEvent.click(second.element(), { force: true });
  await settled();
  expect(ran).toEqual([]);
  expect(screen.getByRole("menu").elements()).toHaveLength(1);
});

test("says which entry of a choice is chosen, and choosing another reports it", async () => {
  const ran: string[] = [];
  const { screen, trigger } = await renderFocused(ran);
  await userEvent.keyboard("{Enter}");
  const first = screen.getByRole("menuitemradio", { name: /First option/ });
  const second = screen.getByRole("menuitemradio", { name: /Second option/ });
  await expect.element(first).toHaveAttribute("aria-checked", "true");
  await expect.element(second).toHaveAttribute("aria-checked", "false");
  // The tick is what a sighted user has for it.
  expect(first.element().querySelectorAll("svg")).toHaveLength(1);
  expect(second.element().querySelectorAll("svg")).toHaveLength(0);

  await userEvent.keyboard("{End}{ArrowUp}");
  await expect.element(second).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  expect(ran).toEqual(["choice: second"]);
  await expect.poll(() => screen.getByRole("menu").elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();

  await userEvent.keyboard("{Enter}");
  await expect.element(second).toHaveAttribute("aria-checked", "true");
  await expect.element(first).toHaveAttribute("aria-checked", "false");
  expect(second.element().querySelectorAll("svg")).toHaveLength(1);
});

// A contrast theme of the system paints text in its own colour, and the
// tick, which is all that marks the chosen entry, kept the token's: with
// the theme stored in sdash the opposite of the system's it was at 2.1:1
// on the system's background. There it takes the colour of its entry.
test("draws the tick of the chosen entry in the colour of the text while the system forces its colours", async () => {
  document.documentElement.dataset.theme = "dark";
  try {
    const { screen } = await renderFocused([]);
    await userEvent.keyboard("{Enter}");
    const first = screen.getByRole("menuitemradio", { name: /First option/ });
    await expect.element(first).toBeVisible();
    const tick = first.element().querySelector("svg");
    const colour = (element: Element | null) =>
      element ? getComputedStyle(element).color : "";
    // The premise: without forced colours it has the token's colour.
    expect(colour(tick)).toBe(colourOf("--ac-t"));
    expect(colour(tick)).not.toBe(colour(first.element()));

    await forceColours(true);
    await expect
      .poll(() => matchMedia("(forced-colors: active)").matches)
      .toBe(true);

    expect(colour(tick)).toBe(colour(first.element()));
  } finally {
    delete document.documentElement.dataset.theme;
  }
});

// A letter jumps to the entry that starts with it. The same letter must
// not also run a shortcut of the page behind the menu, and neither must a
// key the menu has no use for, which reaches the page untouched.
test("rests the shortcuts of the page while it is open", async () => {
  const log: Log = [];
  const screen = await renderWithShortcuts(
    <Registers shortcuts={[logging(log, "t", "page")]}>
      <ShortcutScope scope="view">
        <Registers shortcuts={[logging(log, "Delete", "view")]} />
      </ShortcutScope>
      <Page ran={[]} />
    </Registers>,
  );
  const trigger = screen.getByRole("button", { name: "Actions" });
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("menuitem", { name: "First action" }))
    .toHaveFocus();

  await userEvent.keyboard("t");
  await expect
    .element(screen.getByRole("menuitem", { name: "Third action" }))
    .toHaveFocus();
  await userEvent.keyboard("{Delete}");
  expect(log).toEqual([]);

  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
  // On the closed trigger the letter is a shortcut again, as on any
  // button.
  await userEvent.keyboard("t{Delete}");
  expect(log).toEqual(["page", "view"]);
});

test("names a group by its label", async () => {
  const { screen } = await renderFocused();
  await userEvent.keyboard("{Enter}");

  const actions = screen.getByRole("group", { name: "Example actions" });
  await expect.element(actions).toBeVisible();
  expect(actions.getByRole("menuitem").elements()).toHaveLength(3);
  const choice = screen.getByRole("group", { name: "Example choice" });
  expect(choice.getByRole("menuitemradio").elements()).toHaveLength(2);
  // The destructive entry stands outside both.
  expect(
    screen.getByRole("menuitem", { name: "Delete example" }).elements(),
  ).toHaveLength(1);
  expect(screen.getByRole("separator").elements()).toHaveLength(2);
});

// The colour of a destructive entry repeats what its text says.
test("sets a destructive entry in the colour of an error", async () => {
  const { screen } = await renderFocused();
  await userEvent.keyboard("{Enter}");
  const colourOfText = (name: string) => {
    const text = screen
      .getByRole("menuitem", { name })
      .element()
      .querySelector("span");
    return text ? getComputedStyle(text).color : "";
  };
  const probe = document.createElement("span");
  probe.className = "text-err-fg";
  document.body.append(probe);
  const error = getComputedStyle(probe).color;
  probe.remove();

  expect(colourOfText("Delete example")).toBe(error);
  expect(colourOfText("First action")).not.toBe(error);
});

/**
 * A page that has a place for its popups, as the shell has one in its main
 * region.
 */
function WithPlace({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<HTMLElement | null>(null);
  return (
    <PopupContainer element={place}>
      {children}
      <div ref={setPlace} data-testid="place" />
    </PopupContainer>
  );
}

// A menu that opens from the page lies in the page's place for popups,
// which is inside a landmark. What opens from inside the menu belongs to
// the menu: beside it in the place, it would be behind the menu's cover
// over the page.
test("opens in the place the page has for popups, and keeps what opens from inside it", async () => {
  const screen = await render(
    <WithPlace>
      <Menu trigger={<Button>Actions</Button>}>
        <MenuItem>First action</MenuItem>
        <Tooltip kind="description" label="There is nothing to delete yet.">
          <MenuItem disabled>Delete example</MenuItem>
        </Tooltip>
      </Menu>
    </WithPlace>,
  );
  const place = screen.getByTestId("place").element();
  screen.getByRole("button", { name: "Actions" }).element().focus();
  await userEvent.keyboard("{Enter}");
  const menu = screen.getByRole("menu", { name: "Actions" });
  await expect.element(menu).toBeVisible();
  expect(place.contains(menu.element())).toBe(true);
  expect(
    getComputedStyle(menu.element().parentElement ?? menu.element()).position,
  ).toBe("fixed");

  // The entry that is disabled says why, to a screen reader with its name
  // and to the eye when the arrow keys reach it.
  const disabled = menu.getByRole("menuitem", { name: "Delete example" });
  await expect
    .element(disabled)
    .toHaveAccessibleDescription("There is nothing to delete yet.");
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(disabled).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["There is nothing to delete yet."]);
  const [tooltip] = shownTooltipElements();
  const portal = menu.element().closest("[data-base-ui-portal]");
  expect(portal?.contains(tooltip ?? null)).toBe(true);
});
