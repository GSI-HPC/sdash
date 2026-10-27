// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
import { Input } from "./Input";

const root = document.documentElement;

/** The texts of the elements that describe a control, in their order. */
function descriptionsOf(control: Element): (string | null)[] {
  return (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? null);
}

beforeEach(() => {
  root.dataset.theme = "light";
  localStorage.clear();
});

afterEach(async () => {
  await forceColours(false);
});

// WCAG 2.1, success criteria 1.3.1, 3.3.2 and 4.1.2: a field has a label
// that assistive technology ties to it. A field whose label a heading or a
// toolbar makes plain to the eye still has one.
test("is a text field named by its label, also when the label is hidden", async () => {
  const screen = await render(
    <>
      <Input label="Example name" />
      <Input label="Example filter" labelHidden />
    </>,
  );
  const shown = screen.getByRole("textbox", { name: "Example name" });
  const hidden = screen.getByRole("textbox", { name: "Example filter" });

  await expect.element(shown).toBeVisible();
  await expect.element(hidden).toBeVisible();
  await expect.element(screen.getByText("Example name")).toBeVisible();
  // On the page for assistive technology, and one pixel of it for the eye.
  const label = screen.getByText("Example filter").element();
  expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1);

  // The label is the field's own: a press on it puts the focus in the
  // field.
  await screen.getByText("Example name").click();
  await expect.element(shown).toHaveFocus();
});

// Success criterion 3.3.1: what is wrong is said in text, and the text
// belongs to the field, so that a screen reader reads it with the field
// and not somewhere after it.
test("ties its description and its error to the field, and says it is invalid", async () => {
  const screen = await render(
    <Input
      label="Example name"
      description="Letters and digits."
      error="The name is taken."
    />,
  );
  const field = screen.getByRole("textbox", { name: "Example name" });

  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  await expect.element(screen.getByText("The name is taken.")).toBeVisible();
  await expect
    .poll(() => descriptionsOf(field.element()))
    .toEqual(["Letters and digits.", "The name is taken."]);
  await expect
    .element(field)
    .toHaveAccessibleDescription("Letters and digits. The name is taken.");
});

test("shows no error text and is not invalid without an error", async () => {
  const screen = await render(
    <>
      <Input label="Example name" description="Letters and digits." />
      <Input label="Example title" error="" />
    </>,
  );
  const field = screen.getByRole("textbox", { name: "Example name" });

  await expect.element(field).not.toHaveAttribute("aria-invalid");
  await expect.element(field).not.toHaveAttribute("data-invalid");
  await expect
    .poll(() => descriptionsOf(field.element()))
    .toEqual(["Letters and digits."]);
  // An empty text is no reason, so it marks nothing.
  const other = screen.getByRole("textbox", { name: "Example title" });
  await expect.element(other).not.toHaveAttribute("aria-invalid");
  await expect.element(other).not.toHaveAttribute("aria-describedby");
});

// A caller that leaves the checking to the browser, with a type or a
// pattern, would otherwise get a field marked invalid in colour alone once
// Base UI has looked at it, which it does when Enter is pressed.
test("says in the browser's words what the browser finds wrong, once Enter is pressed", async () => {
  const screen = await render(<Input label="Example address" type="email" />);
  const field = screen.getByRole("textbox", { name: "Example address" });

  await field.click();
  await userEvent.keyboard("example");
  await expect.element(field).not.toHaveAttribute("aria-invalid");
  await userEvent.keyboard("{Enter}");

  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  const said = (field.element() as HTMLInputElement).validationMessage;
  expect(said).not.toBe("");
  await expect.poll(() => descriptionsOf(field.element())).toEqual([said]);
  await expect.element(screen.getByText(said)).toBeVisible();

  await userEvent.keyboard("@example.org{Enter}");
  await expect.element(field).not.toHaveAttribute("aria-invalid");
  await expect.element(field).not.toHaveAttribute("aria-describedby");
});

test("types into the field and reports the change", async () => {
  const changes: string[] = [];
  function Field() {
    const [value, setValue] = useState("");
    return (
      <Input
        label="Example name"
        value={value}
        onValueChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    );
  }
  const screen = await render(<Field />);
  const field = screen.getByRole("textbox", { name: "Example name" });

  await field.click();
  await userEvent.keyboard("abc");

  await expect.element(field).toHaveValue("abc");
  expect(changes).toEqual(["a", "ab", "abc"]);
});

// The icon lies over room the field keeps at its start, so the field is
// the whole box: its ring goes around the icon too, and a press on the
// icon is a press on the field.
test("draws the ring around the whole box when it has an icon", async () => {
  const screen = await render(
    <Input label="Example filter" labelHidden leading="search" />,
  );
  const field = screen.getByRole("textbox", { name: "Example filter" });
  const icon = screen.container.querySelector("svg");
  if (!icon) {
    throw new Error("the field has no icon");
  }
  expect(icon.getAttribute("aria-hidden")).toBe("true");

  await userEvent.tab();
  await expect.element(field).toHaveFocus();

  const style = getComputedStyle(field.element());
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("2px");
  expect(style.outlineColor).toBe(colourOf("--focus"));
  const box = field.element().getBoundingClientRect();
  const drawn = icon.getBoundingClientRect();
  expect(drawn.left).toBeGreaterThan(box.left);
  expect(drawn.right).toBeLessThan(box.right);
  expect(drawn.top).toBeGreaterThan(box.top);
  expect(drawn.bottom).toBeLessThan(box.bottom);
  // The text starts after the icon and not under it.
  expect(parseFloat(style.paddingLeft)).toBeGreaterThan(drawn.right - box.left);

  field.element().blur();
  await expect.element(field).not.toHaveFocus();
  await field.click({
    position: {
      x: drawn.left - box.left + drawn.width / 2,
      y: drawn.top - box.top + drawn.height / 2,
    },
  });
  await expect.element(field).toHaveFocus();
});

// The registry leaves a field its keys: a letter that is a shortcut of the
// page is a letter of the text here.
test("does not run a shortcut for a key typed into it", async () => {
  const log: Log = [];
  const screen = await renderWithShortcuts(
    <Registers
      shortcuts={[logging(log, "t", "theme"), logging(log, "Enter", "open")]}
    >
      <Input label="Example name" />
      <button type="button">Somewhere else</button>
    </Registers>,
  );
  const field = screen.getByRole("textbox", { name: "Example name" });

  await field.click();
  await userEvent.keyboard("t{Enter}");

  await expect.element(field).toHaveValue("t");
  expect(log).toEqual([]);

  // The premise: outside the field the same keys are the page's.
  await screen.getByRole("button", { name: "Somewhere else" }).click();
  await userEvent.keyboard("t");
  expect(log).toEqual(["theme"]);
});

// An empty field is known by its boundary alone, so the boundary has to
// stand 3:1 against the field and its surroundings (WCAG 2.1, success
// criterion 1.4.11): --t3, where the handoff has --bd at 1.1:1. The label,
// the description and the placeholder are text and are --t2, where the
// handoff's --t3 is below 4.5:1 in the light theme. styles/pairs.test.ts
// holds each pair to its ratio; this test ties the field to the pairs.
test.for(["light", "dark"] as const)(
  "has a boundary, a label and a placeholder in the tokens that keep their contrast in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Input
          label="Example name"
          description="Letters and digits."
          placeholder="An example"
        />
        <Input label="Example title" fill="surface" />
      </>,
    );
    const field = screen
      .getByRole("textbox", { name: "Example name" })
      .element();
    const style = getComputedStyle(field);

    expect(style.borderTopColor).toBe(colourOf("--t3"));
    expect(style.borderTopWidth).toBe("1px");
    expect(style.backgroundColor).toBe(colourOf("--bg-elevated"));
    expect(style.color).toBe(colourOf("--t1"));
    expect(getComputedStyle(field, "::placeholder").color).toBe(
      colourOf("--t2"),
    );
    expect(
      getComputedStyle(screen.getByText("Example name").element()).color,
    ).toBe(colourOf("--t2"));
    expect(
      getComputedStyle(screen.getByText("Letters and digits.").element()).color,
    ).toBe(colourOf("--t2"));
    expect(
      getComputedStyle(
        screen.getByRole("textbox", { name: "Example title" }).element(),
      ).backgroundColor,
    ).toBe(colourOf("--bg-surface"));
  },
);

test.for(["light", "dark"] as const)(
  "marks an invalid field with the boundary and the text of an error in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <Input label="Example name" error="The name is taken." />,
    );

    expect(
      getComputedStyle(
        screen.getByRole("textbox", { name: "Example name" }).element(),
      ).borderTopColor,
    ).toBe(colourOf("--err"));
    expect(
      getComputedStyle(screen.getByText("The name is taken.").element()).color,
    ).toBe(colourOf("--err-fg"));
  },
);

// A field that shows a value and takes none, as the handoff draws it: the
// background of the page, a lock beside the label. The value is still
// text to read, so it is --t2 and not the handoff's --t3.
test.for(["light", "dark"] as const)(
  "shows a field that cannot be edited on the page's background with a lock at its label in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        <Input label="Example id" readOnly defaultValue="example-17" mono />
        <Input label="Example name" defaultValue="Example" />
      </>,
    );
    const field = screen.getByRole("textbox", { name: "Example id" });
    await expect.element(field).toHaveAttribute("readonly");
    const style = getComputedStyle(field.element());

    expect(style.backgroundColor).toBe(colourOf("--bg-base"));
    expect(style.color).toBe(colourOf("--t2"));
    expect(style.borderTopColor).toBe(colourOf("--t3"));
    expect(style.fontFamily).toContain("DM Mono");
    const lock = screen.getByText("Example id").element().querySelector("svg");
    expect(lock?.getAttribute("aria-hidden")).toBe("true");
    expect(lock && getComputedStyle(lock).color).toBe(colourOf("--t3"));
    // A field that can be edited has no lock.
    expect(
      screen.getByText("Example name").element().querySelector("svg"),
    ).toBeNull();

    await field.click();
    await userEvent.keyboard("x");
    await expect.element(field).toHaveValue("example-17");
  },
);

// A disabled field is the same field, dimmed: it keeps its fill and does
// not take the background of a field that is read-only, though the
// browser's :read-only is true of both.
test("dims a disabled field and keeps it out of the order of the Tab key", async () => {
  const screen = await render(
    <>
      <Input label="Example name" disabled leading="search" />
      <Input label="Example title" />
    </>,
  );
  const field = screen.getByRole("textbox", { name: "Example name" });
  await expect.element(field).toBeDisabled();
  const style = getComputedStyle(field.element());

  expect(style.opacity).toBe("0.45");
  expect(style.cursor).toBe("not-allowed");
  expect(style.backgroundColor).toBe(colourOf("--bg-elevated"));
  const icon = screen.container.querySelector("div > svg");
  expect(icon && getComputedStyle(icon).opacity).toBe("0.45");

  await userEvent.tab();
  await expect
    .element(screen.getByRole("textbox", { name: "Example title" }))
    .toHaveFocus();
});

// A form library and a dialog that sets the first focus both need the
// element, and a caller needs the attributes of an input.
test("forwards its ref and its native attributes to the input element", async () => {
  let element: HTMLElement | null = null;
  const blur = vi.fn();
  const screen = await render(
    <Input
      ref={(node) => {
        element = node;
      }}
      label="Example name"
      name="example"
      type="search"
      autoComplete="off"
      maxLength={12}
      onBlur={blur}
      className="w-40"
    />,
  );
  const field = screen.getByRole("searchbox", { name: "Example name" });

  expect(element).toBe(field.element());
  await expect.element(field).toHaveAttribute("name", "example");
  await expect.element(field).toHaveAttribute("autocomplete", "off");
  await expect.element(field).toHaveAttribute("maxlength", "12");
  // The class of the caller lays out the whole field, label and all.
  expect(field.element().classList.contains("w-40")).toBe(false);
  expect(field.element().parentElement?.classList.contains("w-40")).toBe(true);
  expect(field.element().getBoundingClientRect().width).toBe(160);

  await field.click();
  await userEvent.tab();
  expect(blur).toHaveBeenCalledTimes(1);
});

// The two heights are heights of the scale, so that a field lines up with
// a button of its size.
test("is as high as a control of its size, with or without an icon", async () => {
  const screen = await render(
    <>
      <Input label="Medium" />
      <Input label="Small" size="sm" />
      <Input label="Medium with icon" leading="search" />
      <Input label="Small with icon" size="sm" leading="search" />
    </>,
  );
  const height = (name: string) =>
    screen.getByRole("textbox", { name }).element().getBoundingClientRect()
      .height;

  expect(height("Medium")).toBe(32);
  expect(height("Small")).toBe(28);
  expect(height("Medium with icon")).toBe(32);
  expect(height("Small with icon")).toBe(28);
});

// A contrast theme of the system paints every boundary in one colour, so
// the colour of an error is gone: the invalid field is told from the
// others by the width of its boundary, and by its text.
test("has a thicker boundary when invalid while the system forces its colours", async () => {
  const screen = await render(
    <>
      <Input label="Example name" error="The name is taken." />
      <Input label="Example title" />
    </>,
  );
  const width = (name: string) =>
    getComputedStyle(screen.getByRole("textbox", { name }).element())
      .borderTopWidth;
  expect(width("Example name")).toBe("1px");

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(width("Example name")).toBe("2px");
  expect(width("Example title")).toBe("1px");
});

// A label that is left to assistive technology is taken out of the flow.
// Without a positioned element around it the page itself holds it, and
// not the region the field scrolls in: far down the gallery the window
// then scrolled, by the wheel and by End, and the whole shell went out of
// sight. The field holds its label itself; that the window of the binary
// does not scroll is in e2e/zoom-and-contrast.spec.ts.
test("holds a hidden label itself, in a region that scrolls", async () => {
  const screen = await render(
    <div data-testid="region" className="h-40 overflow-auto">
      <div className="h-[300vh]" />
      <Input label="Example filter" labelHidden />
    </div>,
  );
  const field = screen.getByRole("textbox", { name: "Example filter" });
  await expect.element(field).toBeInTheDocument();
  const label = screen.getByText("Example filter").element() as HTMLElement;

  // The premise: the label is out of the flow, and nothing around the
  // field is positioned.
  expect(getComputedStyle(label).position).toBe("absolute");
  expect(
    getComputedStyle(screen.getByTestId("region").element()).position,
  ).toBe("static");
  expect(label.offsetParent).toBe(field.element().parentElement);
});

// The error is tied to the field as a description, which a screen reader
// reads on arriving at the field and not when it changes. So it appears in
// a place that is on the page before it and announces what comes into it
// (WCAG 2.1, success criterion 4.1.3).
test("puts the text of an error into a place that announces it, which is there before the error", async () => {
  const screen = await render(<Input label="Example name" />);
  const field = screen.getByRole("textbox", { name: "Example name" });
  const place = screen.getByRole("status");

  await expect.element(place).toBeEmptyDOMElement();
  // Empty, it takes no room: the field ends where its control does.
  const whole = field.element().parentElement?.getBoundingClientRect();
  expect(whole?.bottom).toBe(field.element().getBoundingClientRect().bottom);

  await screen.rerender(
    <Input label="Example name" error="The name is taken." />,
  );

  await expect.element(place).toHaveTextContent("The name is taken.");
  expect(screen.getByRole("status").elements()).toEqual([place.element()]);
  // Below the field, by the gap the column has.
  const text = screen.getByText("The name is taken.").element();
  expect(
    text.getBoundingClientRect().top -
      field.element().getBoundingClientRect().bottom,
  ).toBe(5);
});

// A contrast theme of the system paints text in its own colour. An icon
// with a colour class of its own kept the token's, which is the token of
// the theme stored in sdash and can be the opposite of the system's: the
// lock was then at 2.1:1 on the system's background. There it takes the
// colour of the text it stands beside.
test("draws its lock and its icon in the colour of the text while the system forces its colours", async () => {
  root.dataset.theme = "dark";
  const screen = await render(
    <>
      <Input label="Example name" readOnly defaultValue="First example" />
      <Input label="Example filter" leading="search" />
    </>,
  );
  const lock = screen.getByText("Example name").element().querySelector("svg");
  const icon = screen
    .getByRole("textbox", { name: "Example filter" })
    .element()
    .parentElement?.querySelector("svg");
  if (!lock || !icon) {
    throw new Error("the fields show no icons");
  }
  const colour = (element: Element | null) =>
    element ? getComputedStyle(element).color : "";
  // The premise: without forced colours each has the token's colour.
  expect(colour(lock)).toBe(colourOf("--t3"));
  expect(colour(lock)).not.toBe(colour(lock.parentElement));

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(colour(lock)).toBe(colour(lock.parentElement));
  expect(colour(icon)).toBe(colour(icon.parentElement));
});
