// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { forceColours } from "../testing/system";
import { Button } from "./Button";
import { Popover } from "./Popover";
import { NestedPopups, PopupContainer } from "./popups";
import { Select, type SelectOption, type SelectProps } from "./Select";

const root = document.documentElement;

type Choice = "first" | "second" | "third" | "fourth";

const options: readonly SelectOption<Choice>[] = [
  { value: "first", label: "First option" },
  { value: "second", label: "Second option" },
  { value: "third", label: "Third option" },
  { value: "fourth", label: "Fourth option" },
];

/**
 * A select that keeps its own choice, as the view that owns it would, and
 * writes every change down.
 */
function Choose({
  initially = "first",
  changes = [],
  ...select
}: Partial<SelectProps<Choice>> & {
  initially?: Choice | null;
  changes?: Choice[];
}) {
  const [value, setValue] = useState<Choice | null>(initially);
  return (
    <Select
      label="Example choice"
      options={options}
      {...select}
      value={value}
      onValueChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
    />
  );
}

/**
 * The labels of the options that show, in their order. Base UI puts the
 * options on the page when the field first gets the focus and keeps them
 * there, in a hidden element, while the list is closed.
 */
function listed(): (string | null)[] {
  return [...document.querySelectorAll('[role="option"]')]
    .filter((option) => option.checkVisibility())
    .map((option) => option.textContent);
}

/** The label of the option that has the focus, or null. */
function marked(): string | null {
  const focused = document.activeElement;
  return focused?.getAttribute("role") === "option"
    ? focused.textContent
    : null;
}

beforeEach(() => {
  root.dataset.theme = "light";
  localStorage.clear();
});

afterEach(async () => {
  await forceColours(false);
});

// WAI-ARIA's combobox that only selects: the field has the role, the name
// of its label, the chosen option as its value, and says that a list
// belongs to it and whether the list is open (WCAG 2.1, 4.1.2).
test("is named by its label and shows the chosen option", async () => {
  const screen = await render(<Choose initially="second" />);
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await expect.element(field).toHaveTextContent("Second option");
  await expect.element(field).toHaveAttribute("aria-haspopup", "listbox");
  await expect.element(field).toHaveAttribute("aria-expanded", "false");
  await expect.element(screen.getByText("Example choice")).toBeVisible();
  expect(listed()).toEqual([]);
});

test("opens by the keyboard, moves with the arrow keys and chooses with Enter", async () => {
  const changes: Choice[] = [];
  const screen = await render(<Choose changes={changes} />);
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await userEvent.tab();
  await expect.element(field).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect.element(field).toHaveAttribute("aria-expanded", "true");
  await expect
    .element(screen.getByRole("listbox"))
    .toHaveAccessibleName("Example choice");
  expect(listed()).toEqual(options.map(({ label }) => label));
  // The focus is on the chosen option, which says that it is the chosen
  // one.
  await expect.poll(marked).toBe("First option");
  await expect
    .element(screen.getByRole("option", { name: "First option" }))
    .toHaveAttribute("aria-selected", "true");

  await userEvent.keyboard("{ArrowDown}{ArrowDown}");
  await expect.poll(marked).toBe("Third option");
  await userEvent.keyboard("{ArrowUp}");
  await expect.poll(marked).toBe("Second option");
  await userEvent.keyboard("{End}");
  await expect.poll(marked).toBe("Fourth option");
  await userEvent.keyboard("{Home}");
  await expect.poll(marked).toBe("First option");
  // Typing jumps to the option that starts with what was typed.
  await userEvent.keyboard("th");
  await expect.poll(marked).toBe("Third option");
  expect(changes).toEqual([]);

  await userEvent.keyboard("{Enter}");

  await expect.poll(listed).toEqual([]);
  await expect.element(field).toHaveTextContent("Third option");
  await expect.element(field).toHaveFocus();
  expect(changes).toEqual(["third"]);
});

// The other keys that open a list, and the other key that chooses.
test("opens with Space and with the arrow keys too, and Space chooses", async () => {
  const changes: Choice[] = [];
  const screen = await render(<Choose changes={changes} />);
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await userEvent.tab();

  for (const key of ["{ArrowDown}", "{ArrowUp}"]) {
    await userEvent.keyboard(key);
    await expect.element(field).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    await expect.element(field).toHaveAttribute("aria-expanded", "false");
  }

  await userEvent.keyboard(" ");
  await expect.poll(marked).toBe("First option");
  await userEvent.keyboard("{ArrowDown} ");

  await expect.poll(listed).toEqual([]);
  expect(changes).toEqual(["second"]);
});

test("gives the focus back to its trigger on Escape and changes nothing", async () => {
  const changes: Choice[] = [];
  const screen = await render(<Choose changes={changes} />);
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");
  await userEvent.keyboard("{ArrowDown}");
  await expect.poll(marked).toBe("Second option");

  await userEvent.keyboard("{Escape}");

  await expect.poll(listed).toEqual([]);
  await expect.element(field).toHaveFocus();
  await expect.element(field).toHaveTextContent("First option");
  expect(changes).toEqual([]);
});

test("closes on a press outside and changes nothing", async () => {
  const changes: Choice[] = [];
  const screen = await render(
    <>
      <Choose changes={changes} />
      <p className="mt-64">Somewhere else</p>
    </>,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await field.click();
  await expect.poll(listed).toHaveLength(4);

  // Forced: while the list is open the page behind it takes no press of
  // its own, and that is the press this is about.
  await screen.getByText("Somewhere else").click({ force: true });

  await expect.poll(listed).toEqual([]);
  expect(changes).toEqual([]);
});

test("chooses the option that is pressed", async () => {
  const changes: Choice[] = [];
  const screen = await render(<Choose changes={changes} />);
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await field.click();
  await screen.getByRole("option", { name: "Fourth option" }).click();

  await expect.poll(listed).toEqual([]);
  await expect.element(field).toHaveTextContent("Fourth option");
  expect(changes).toEqual(["fourth"]);
});

// A native select chooses by a letter while it is closed, and so does
// this one. Base UI lets the letter go on to the page, where "t" is the
// shortcut of the theme: the field has to keep it.
test("jumps to an option by its first letter while closed, and no shortcut runs for that letter", async () => {
  const log: Log = [];
  const changes: Choice[] = [];
  const screen = await renderWithShortcuts(
    <Registers shortcuts={[logging(log, "t", "theme")]}>
      <Choose changes={changes} />
      <button type="button">Somewhere else</button>
    </Registers>,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await userEvent.tab();
  await expect.element(field).toHaveFocus();

  await userEvent.keyboard("t");

  await expect.element(field).toHaveTextContent("Third option");
  await expect.element(field).toHaveAttribute("aria-expanded", "false");
  expect(changes).toEqual(["third"]);
  expect(log).toEqual([]);

  // The premise: on a button the same letter is the page's.
  await userEvent.tab();
  await userEvent.keyboard("t");
  expect(log).toEqual(["theme"]);
});

// The list has the focus as a dialog has, and what is behind it is not
// what the user is looking at: "Delete" must not act on a row of the view
// while the user moves through options (doc/ui.md, "Behind a dialog").
test("rests the shortcuts of the page while its list is open", async () => {
  const log: Log = [];
  const screen = await renderWithShortcuts(
    <Registers
      shortcuts={[logging(log, "Delete", "delete"), logging(log, "x", "x")]}
    >
      <Choose />
    </Registers>,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await userEvent.tab();
  await userEvent.keyboard("{Delete}");
  expect(log).toEqual(["delete"]);

  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");
  await userEvent.keyboard("{Delete}x");
  expect(log).toEqual(["delete"]);

  await userEvent.keyboard("{Escape}");
  await expect.element(field).toHaveFocus();
  await userEvent.keyboard("{Delete}");
  expect(log).toEqual(["delete", "delete"]);
});

// An option that cannot be chosen is still listed and still reached by
// the arrow keys, so that a screen reader user learns that it is there and
// that it is disabled. Enter does nothing on it, and typing passes it by.
test("stops on an option that is disabled, says that it is, and does not choose it", async () => {
  const changes: Choice[] = [];
  const screen = await render(
    <Choose
      changes={changes}
      options={[
        { value: "first", label: "First option" },
        { value: "second", label: "Second option", disabled: true },
        { value: "third", label: "Third option" },
        { value: "fourth", label: "Selected option" },
      ]}
    />,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");
  const disabled = screen.getByRole("option", { name: "Second option" });
  await expect.element(disabled).toHaveAttribute("aria-disabled", "true");
  // Its text is dimmed and the option is not: opacity on the option would
  // dim the ring of its focus with it, to 1.8:1 in the light theme.
  const text = disabled.element().lastElementChild;
  expect(text && getComputedStyle(text).opacity).toBe("0.45");
  expect(getComputedStyle(disabled.element()).opacity).toBe("1");

  await userEvent.keyboard("{ArrowDown}");
  await expect.poll(marked).toBe("Second option");
  expect(getComputedStyle(disabled.element()).outlineColor).toBe(
    colourOf("--focus"),
  );
  await userEvent.keyboard("{Enter}");
  expect(changes).toEqual([]);
  expect(listed()).toHaveLength(4);

  // Forced, because an option that cannot be chosen is no target.
  await disabled.click({ force: true });
  expect(changes).toEqual([]);
  expect(listed()).toHaveLength(4);

  // "s" is the first letter of two options, and the disabled one is not
  // the one typing finds.
  await userEvent.keyboard("{Home}s");
  await expect.poll(marked).toBe("Selected option");
  await userEvent.keyboard("{Escape}");
  await expect.element(field).toHaveFocus();
  await userEvent.keyboard("s");
  await expect.element(field).toHaveTextContent("Selected option");
  expect(changes).toEqual(["fourth"]);
});

// A placeholder is text to read, so it is --t2 where the value is --t1.
test("shows its placeholder while nothing is chosen", async () => {
  const screen = await render(
    <Choose initially={null} placeholder="Choose an option" />,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  const shown = screen.getByText("Choose an option");

  await expect.element(shown).toBeVisible();
  expect(getComputedStyle(shown.element()).color).toBe(colourOf("--t2"));

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  // Nothing is chosen, so the first option is where the list starts.
  await expect.poll(marked).toBe("First option");
  await userEvent.keyboard("{Enter}");

  await expect.element(field).toHaveTextContent("First option");
  await expect.element(shown).not.toBeInTheDocument();
  const value = field.element().querySelector("span");
  expect(value?.textContent).toBe("First option");
  expect(value && getComputedStyle(value).color).toBe(colourOf("--t1"));
});

test("ties its error to the trigger", async () => {
  const screen = await render(
    <Choose
      description="One of four."
      error="This option is not offered here."
    />,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(field)
    .toHaveAccessibleDescription(
      "One of four. This option is not offered here.",
    );
  await expect
    .element(screen.getByText("This option is not offered here."))
    .toBeVisible();
});

test("is not invalid and has nothing below it without an error or a description", async () => {
  const screen = await render(<Choose />);
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await expect.element(field).not.toHaveAttribute("aria-invalid");
  await expect.element(field).not.toHaveAttribute("aria-describedby");
});

// A press on the label of a native select gives the select the focus. A
// label element around Base UI's button would press the button, and the
// list would open under a pointer that only meant to read.
test("takes the focus when its label is pressed and keeps its list closed", async () => {
  const screen = await render(<Choose />);
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await screen.getByText("Example choice").click();

  await expect.element(field).toHaveFocus();
  await expect.element(field).toHaveAttribute("aria-expanded", "false");
  expect(listed()).toEqual([]);
});

test("is named by a label that only assistive technology is shown", async () => {
  const screen = await render(<Choose labelHidden />);

  await expect
    .element(screen.getByRole("combobox", { name: "Example choice" }))
    .toBeVisible();
  expect(
    screen.getByText("Example choice").element().getBoundingClientRect().width,
  ).toBeLessThanOrEqual(1);
});

test("cannot be opened while it is disabled", async () => {
  const screen = await render(
    <>
      <Choose disabled />
      <button type="button">Somewhere else</button>
    </>,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await expect.element(field).toBeDisabled();
  expect(getComputedStyle(field.element()).opacity).toBe("0.45");

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Somewhere else" }))
    .toHaveFocus();
  await field.click({ force: true });
  expect(listed()).toEqual([]);
});

// Base UI's list brings a style element of its own, for a list without a
// scrollbar, which this select has no use for. The server's
// Content-Security-Policy refuses a style element, and the browser then
// reports the page as broken: the select has to bring none, with or
// without a provider around the application that says so.
//
// The element is counted, and not compared with how many there were before
// the list opened. React moves it into the head of the page and leaves it
// there, and the tests of this file share one page: a select that added it
// in an earlier test would have added none in this one.
test("adds no style element to the page", async () => {
  const screen = await render(<Choose />);
  const field = screen.getByRole("combobox", { name: "Example choice" });

  await userEvent.tab();
  await expect.element(field).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");

  expect(
    document.querySelectorAll('style[data-href~="base-ui-disable-scrollbar"]'),
  ).toHaveLength(0);
});

// The shell has a place for popups inside its main region, so that a list
// is in a landmark. A select that is told of the place opens there, fixed
// to the window, and one that is not opens where Base UI puts it.
test("opens its list in the place the shell has for popups", async () => {
  function Page() {
    const [place, setPlace] = useState<HTMLElement | null>(null);
    return (
      <PopupContainer element={place}>
        {/* With room around it, so that the list is not pushed aside. */}
        <Choose className="m-8 w-60" />
        <div ref={setPlace} data-testid="place" />
      </PopupContainer>
    );
  }
  const screen = await render(<Page />);
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");

  const list = screen.getByRole("listbox").element();
  const place = screen.getByTestId("place").element();
  expect(place.contains(list)).toBe(true);
  // Below the field, starting at its left edge, at least as wide.
  const box = field.element().getBoundingClientRect();
  const popup = list.getBoundingClientRect();
  expect(popup.top).toBeGreaterThanOrEqual(box.bottom);
  expect(Math.abs(popup.left - box.left)).toBeLessThanOrEqual(1);
  expect(popup.width).toBeGreaterThanOrEqual(box.width);
});

// A list that opens from inside a dialog or another popup belongs to that
// overlay: in the shell's place it would lie under the overlay's scrim and
// be hidden from assistive technology with the rest of the page.
test("opens its list where Base UI puts it when it is inside an overlay", async () => {
  function Page() {
    const [place, setPlace] = useState<HTMLElement | null>(null);
    return (
      <PopupContainer element={place}>
        <NestedPopups>
          <Choose className="m-8 w-60" />
        </NestedPopups>
        <div ref={setPlace} data-testid="place" />
      </PopupContainer>
    );
  }
  const screen = await render(<Page />);
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");

  const list = screen.getByRole("listbox").element();
  expect(screen.getByTestId("place").element().contains(list)).toBe(false);
  expect(list.closest("[data-base-ui-portal]")?.parentElement).toBe(
    document.body,
  );
});

// The shell's place for popups is at the end of the main region, which
// scrolls. A list laid out there, and not fixed to the window, takes the
// focus where the place is: the browser would scroll the region to its
// end to show it, and the popover the list was opened from would be gone
// from the screen with its button.
test("leaves the page where it is when its list opens from inside a popover", async () => {
  function Page() {
    const [place, setPlace] = useState<HTMLElement | null>(null);
    return (
      <div data-testid="region" className="h-80 overflow-auto">
        <PopupContainer element={place}>
          <Popover
            trigger={<Button>Example settings</Button>}
            title="Example settings"
          >
            <Choose className="m-3 w-60" />
          </Popover>
          <div className="h-[200vh]" />
          <div ref={setPlace} className="relative" />
        </PopupContainer>
      </div>
    );
  }
  const screen = await render(<Page />);
  const region = screen.getByTestId("region").element();
  screen.getByRole("button", { name: "Example settings" }).element().focus();
  await userEvent.keyboard("{Enter}");
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await expect.element(field).toHaveFocus();

  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");

  expect(region.scrollTop).toBe(0);
  const list = screen.getByRole("listbox").element();
  expect(getComputedStyle(list.parentElement ?? list).position).toBe("fixed");
  // Below its field, where the user is looking.
  const gap =
    list.getBoundingClientRect().top -
    field.element().getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(8);
});

// The field of a select is a field: the boundary that an empty one is
// known by is --t3, and an error turns it to the colour of one. The tick
// of the chosen option and the fill of the marked one are what tell them
// from the others in the list.
test.for(["light", "dark"] as const)(
  "has the boundary of a field, and marks the chosen option with a tick, in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Choose />
        <Choose label="Another choice" fill="surface" error="Not offered." />
      </>,
    );
    const field = screen.getByRole("combobox", { name: "Example choice" });
    const other = screen.getByRole("combobox", { name: "Another choice" });
    const style = getComputedStyle(field.element());

    expect(style.borderTopColor).toBe(colourOf("--t3"));
    expect(style.backgroundColor).toBe(colourOf("--bg-elevated"));
    expect(style.color).toBe(colourOf("--t1"));
    expect(getComputedStyle(other.element()).borderTopColor).toBe(
      colourOf("--err"),
    );
    expect(getComputedStyle(other.element()).backgroundColor).toBe(
      colourOf("--bg-surface"),
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect.poll(marked).toBe("First option");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(marked).toBe("Second option");

    const chosen = screen.getByRole("option", { name: "First option" });
    const current = screen.getByRole("option", { name: "Second option" });
    const tick = chosen.element().querySelector("svg");
    expect(tick && getComputedStyle(tick).color).toBe(colourOf("--ac-t"));
    expect(current.element().querySelector("svg")).toBeNull();
    expect(getComputedStyle(current.element()).backgroundColor).toBe(
      colourOf("--bg-hover"),
    );
    expect(getComputedStyle(chosen.element()).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
    // The marked option has the focus, and the ring is drawn inside it,
    // where the list does not cut it off.
    const ring = getComputedStyle(current.element());
    expect(ring.outlineStyle).toBe("solid");
    expect(ring.outlineOffset).toBe("-2px");
    expect(ring.outlineColor).toBe(colourOf("--focus"));
    expect(
      getComputedStyle(screen.getByRole("listbox").element()).backgroundColor,
    ).toBe(colourOf("--bg-surface"));
  },
);

// The labels of the list start at one line whether an option has the tick
// or not.
test("lines up the labels of its options", async () => {
  const screen = await render(<Choose />);
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");
  // The text of an option is its last element; the place of the tick is
  // before it.
  const start = (name: string) =>
    screen
      .getByRole("option", { name })
      .element()
      .lastElementChild?.getBoundingClientRect().left;

  expect(start("First option")).toBeDefined();
  expect(start("Second option")).toBe(start("First option"));
});

// A contrast theme of the system paints every boundary alike: the invalid
// field is told from the others by the width of its boundary.
test("has a thicker boundary when invalid while the system forces its colours", async () => {
  const screen = await render(
    <>
      <Choose error="Not offered." />
      <Choose label="Another choice" />
    </>,
  );
  const width = (name: string) =>
    getComputedStyle(screen.getByRole("combobox", { name }).element())
      .borderTopWidth;

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(width("Example choice")).toBe("2px");
  expect(width("Another choice")).toBe("1px");
});

// As for a text field: a hidden label is taken out of the flow, and has to
// be held by the field and not by the page, which grew by it (Input.tsx
// says why).
test("holds a hidden label itself, in a region that scrolls", async () => {
  const screen = await render(
    <div data-testid="region" className="h-40 overflow-auto">
      <div className="h-[300vh]" />
      <Choose labelHidden />
    </div>,
  );
  const field = screen.getByRole("combobox", { name: "Example choice" });
  await expect.element(field).toBeInTheDocument();
  const label = screen.getByText("Example choice").element() as HTMLElement;

  expect(getComputedStyle(label).position).toBe("absolute");
  expect(
    getComputedStyle(screen.getByTestId("region").element()).position,
  ).toBe("static");
  expect(label.offsetParent).toBe(field.element().parentElement);
});

// The error is a description of the field, which is read on arriving at
// the field and not when it changes: it appears in a place that is there
// before it and announces it (WCAG 2.1, success criterion 4.1.3).
test("puts the text of an error into a place that announces it, which is there before the error", async () => {
  const screen = await render(<Choose />);
  const field = screen.getByRole("combobox", { name: "Example choice" });
  const place = screen.getByRole("status");

  await expect.element(place).toBeEmptyDOMElement();
  const whole = field.element().parentElement?.getBoundingClientRect();
  expect(whole?.bottom).toBe(field.element().getBoundingClientRect().bottom);

  await screen.rerender(<Choose error="This option is not offered here." />);

  await expect
    .element(place)
    .toHaveTextContent("This option is not offered here.");
});

// A contrast theme of the system paints text in its own colour, and an
// icon with a colour class of its own kept the token's. The tick is all
// that marks the chosen option: with the theme stored in sdash the
// opposite of the system's it was at 2.1:1 on the system's background.
test("draws its arrow and its tick in the colour of the text while the system forces its colours", async () => {
  root.dataset.theme = "dark";
  const screen = await render(<Choose />);
  const field = screen.getByRole("combobox", { name: "Example choice" });
  const colour = (element: Element | null) =>
    element ? getComputedStyle(element).color : "";
  const arrow = field.element().querySelector("svg");
  // The premise: without forced colours the arrow has the token's colour.
  expect(colour(arrow)).toBe(colourOf("--t3"));
  expect(colour(arrow)).not.toBe(colour(field.element()));

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);
  await userEvent.tab();
  await expect.element(field).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(marked).toBe("First option");

  expect(colour(arrow)).toBe(colour(field.element()));
  const chosen = screen.getByRole("option", { name: "First option" });
  const tick = chosen.element().querySelector("svg");
  expect(tick).not.toBeNull();
  expect(colour(tick)).toBe(colour(chosen.element()));
});
