// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Button, type ButtonTone, type ButtonVariant } from "./Button";

const root = document.documentElement;

/** The opacity of each element a control holds. */
function dimming(control: Element): string[] {
  return [...control.children].map((child) => getComputedStyle(child).opacity);
}

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

// WAI-ARIA's button pattern, which the native element brings: a button is
// found by what it says (WCAG 2.1, success criteria 4.1.2 and 2.5.3) and
// pressed by either key (2.1.1).
test("is a button named by its text that Enter and Space press", async () => {
  const press = vi.fn();
  const screen = await render(<Button onClick={press}>Save changes</Button>);
  const button = screen.getByRole("button", { name: "Save changes" });
  await expect.element(button).toHaveAttribute("type", "button");

  await userEvent.tab();
  await expect.element(button).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(press).toHaveBeenCalledTimes(1);

  await userEvent.keyboard(" ");
  expect(press).toHaveBeenCalledTimes(2);

  await button.click();
  expect(press).toHaveBeenCalledTimes(3);
});

// A button that is disabled with nothing to explain is out of the way of
// a keyboard user, as a native one is.
test("does nothing and leaves the order of the Tab key while disabled", async () => {
  const press = vi.fn();
  const screen = await render(
    <>
      <Button disabled onClick={press}>
        Save changes
      </Button>
      <Button>Discard changes</Button>
    </>,
  );
  const button = screen.getByRole("button", { name: "Save changes" });
  await expect.element(button).toBeDisabled();
  // Its text is dimmed as the handoff dims a disabled button, and the
  // pointer is not a hand over it.
  expect(dimming(button.element())).toEqual(["0.45"]);
  expect(getComputedStyle(button.element()).cursor).toBe("not-allowed");

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Discard changes" }))
    .toHaveFocus();

  // The press is forced, because a disabled button is no target at all.
  await button.click({ force: true });
  expect(press).not.toHaveBeenCalled();
});

// A button whose reason for being disabled the user should learn stays
// where the Tab key finds it, so that the reason, a tooltip that describes
// it, can be read without a pointer. It says that it is disabled and a
// press does nothing.
test("stays in the order of the Tab key and does nothing when it is disabled with a reason to give", async () => {
  const press = vi.fn();
  const screen = await render(
    <Button disabled focusableWhenDisabled onClick={press}>
      Save changes
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save changes" });
  await expect.element(button).toHaveAttribute("aria-disabled", "true");
  await expect.element(button).not.toHaveAttribute("disabled");
  expect(dimming(button.element())).toEqual(["0.45"]);

  await userEvent.tab();
  await expect.element(button).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard(" ");
  await button.click({ force: true });

  expect(press).not.toHaveBeenCalled();
});

// Opacity on a disabled button would dim its ring with it, to 1.9:1 in
// the light theme, and a keyboard user has to see where the focus is
// (WCAG 2.1, success criterion 2.4.7). The button dims what it holds
// instead: its icons, its text and, where it is filled, its fill.
test.for(["light", "dark"] as const)(
  "keeps the ring of the focus at full strength while it is disabled, in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <Button
        variant="primary"
        icon="search"
        iconEnd="chevronDown"
        disabled
        focusableWhenDisabled
      >
        Save changes
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save changes" });

    await userEvent.tab();
    await expect.element(button).toHaveFocus();

    const style = getComputedStyle(button.element());
    expect(style.opacity).toBe("1");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe(colourOf("--focus"));
    // Both icons and the text.
    expect(dimming(button.element())).toEqual(["0.45", "0.45", "0.45"]);
    // The fill is the accent, let through by the same measure.
    expect(style.backgroundColor).not.toBe(colourOf("--ac-l"));
    expect(style.backgroundColor).toContain("0.45");
  },
);

// A tooltip, a popover and a menu turn the button they are given into
// their trigger: they hand it a ref to measure it by, and the attributes
// that say what it opens. All of it has to arrive at the element.
test("forwards its ref and its native attributes to the button element", async () => {
  let element: HTMLElement | null = null;
  const screen = await render(
    <Button
      ref={(node) => {
        element = node;
      }}
      id="example-save"
      type="submit"
      aria-haspopup="menu"
      aria-expanded={false}
      data-example="yes"
      className="ml-2"
    >
      Save changes
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save changes" });

  expect(element).toBe(button.element());
  await expect.element(button).toHaveAttribute("id", "example-save");
  await expect.element(button).toHaveAttribute("type", "submit");
  await expect.element(button).toHaveAttribute("aria-haspopup", "menu");
  await expect.element(button).toHaveAttribute("aria-expanded", "false");
  await expect.element(button).toHaveAttribute("data-example", "yes");
  // A class of the caller is added to the look and does not replace it.
  await expect.element(button).toHaveClass("ml-2", "inline-flex");
});

// WCAG 2.1, success criterion 2.4.7. The ring is the stylesheet's, in the
// focus token, 2 px off the button: the gap is what keeps it apart from
// the fill of a primary button, which has the ring's own colour.
test("shows the ring of the keyboard focus", async () => {
  const screen = await render(<Button variant="primary">Save changes</Button>);
  const button = screen.getByRole("button", { name: "Save changes" });

  await userEvent.tab();
  await expect.element(button).toHaveFocus();

  const style = getComputedStyle(button.element());
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("2px");
  expect(style.outlineOffset).toBe("2px");
  expect(style.outlineColor).toBe(colourOf("--focus"));
});

// The handoff lets a disabled button answer the pointer, dimmed with the
// rest of it. Here the button itself is not dimmed, and a fill that
// changed under the pointer would say that the button works.
test("does not answer the pointer while it is disabled", async () => {
  const screen = await render(
    <>
      <Button variant="primary" disabled>
        Save changes
      </Button>
      <Button disabled focusableWhenDisabled>
        Discard changes
      </Button>
      <Button tone="danger" disabled focusableWhenDisabled>
        Delete example
      </Button>
      <Button variant="ghost" disabled focusableWhenDisabled>
        Read more
      </Button>
      <Button>Somewhere else</Button>
    </>,
  );
  const style = (name: string) =>
    getComputedStyle(screen.getByRole("button", { name }).element());
  const hover = (name: string) =>
    screen.getByRole("button", { name }).hover({ force: true });
  // The premise: the pointer is where the test says, and a button that
  // works answers it.
  await hover("Somewhere else");
  await expect
    .poll(() => style("Somewhere else").backgroundColor)
    .toBe(colourOf("--bg-hover"));

  await hover("Save changes");
  await expect
    .poll(() => style("Somewhere else").backgroundColor)
    .toBe(colourOf("--bg-surface"));
  expect(style("Save changes").filter).toBe("brightness(1)");

  await hover("Discard changes");
  await expect.poll(() => style("Save changes").filter).toBe("brightness(1)");
  expect(style("Discard changes").backgroundColor).toBe(
    colourOf("--bg-surface"),
  );

  await hover("Delete example");
  expect(style("Delete example").borderTopColor).toBe("rgba(0, 0, 0, 0)");

  await hover("Read more");
  expect(style("Read more").textDecorationLine).toBe("none");
});

/** The tokens each look takes its fill and its text from. */
const pairs: readonly {
  variant: ButtonVariant;
  tone: ButtonTone;
  fill: string | null;
  text: string;
}[] = [
  { variant: "primary", tone: "default", fill: "--ac-l", text: "--bg-surface" },
  {
    variant: "primary",
    tone: "danger",
    fill: "--err-fg",
    text: "--bg-surface",
  },
  { variant: "secondary", tone: "default", fill: "--bg-surface", text: "--t1" },
  {
    variant: "secondary",
    tone: "danger",
    fill: "--bg-surface",
    text: "--err-fg",
  },
  { variant: "ghost", tone: "default", fill: null, text: "--ac-t" },
  { variant: "ghost", tone: "danger", fill: null, text: "--err-fg" },
];

// The handoff sets white on --ac and on --err, which is below 4.5:1 in
// both themes. The pairs used in their place are tokens, so that they
// follow the theme, and styles/pairs.test.ts holds each to its ratio. This
// test is what ties a button to its pair.
test.for(["light", "dark"] as const)(
  "takes its fill and its text from the tokens of its look in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        {pairs.map(({ variant, tone }) => (
          <Button key={`${variant} ${tone}`} variant={variant} tone={tone}>
            {`Example ${variant} ${tone}`}
          </Button>
        ))}
        <p>Somewhere else</p>
      </>,
    );
    // The tests of this file share one pointer, and a button under it has
    // the fill of its hover.
    await screen.getByText("Somewhere else").hover();

    for (const { variant, tone, fill, text } of pairs) {
      const style = getComputedStyle(
        screen
          .getByRole("button", { name: `Example ${variant} ${tone}` })
          .element(),
      );
      expect(style.color, `${variant} ${tone}`).toBe(colourOf(text));
      expect(style.backgroundColor, `${variant} ${tone}`).toBe(
        fill ? colourOf(fill) : "rgba(0, 0, 0, 0)",
      );
    }
  },
);

// A filled button answers the pointer and a press by its brightness, as
// the handoff's toned buttons do, since a second fill for each would be
// two more pairs to keep at 4.5:1. styles/pairs.test.ts holds the pair at
// both strengths.
test("is brighter under the pointer and darker while it is held down", async () => {
  const screen = await render(
    <>
      <Button variant="primary">Save changes</Button>
      <p>Somewhere else</p>
    </>,
  );
  const button = screen.getByRole("button", { name: "Save changes" });
  const filter = () => getComputedStyle(button.element()).filter;
  await screen.getByText("Somewhere else").hover();
  await expect.poll(filter).toBe("none");

  await button.hover();
  await expect.poll(filter).toBe("brightness(1.08)");

  await screen.getByText("Somewhere else").hover();
  await userEvent.tab();
  await expect.element(button).toHaveFocus();
  // Space held down is a press that lasts.
  await userEvent.keyboard("{Space>}");
  await expect.poll(filter).toBe("brightness(0.92)");
  await userEvent.keyboard("{/Space}");
  await expect.poll(filter).toBe("none");
});

// The bordered button has a fill for each of the two instead, the soft
// destructive one a border, and the text button an underline, as a link.
test("answers the pointer in the way of its look when it is not filled", async () => {
  const screen = await render(
    <>
      <Button>Save changes</Button>
      <Button tone="danger">Delete example</Button>
      <Button variant="ghost">Read more</Button>
      <p>Somewhere else</p>
    </>,
  );
  const style = (name: string) =>
    getComputedStyle(screen.getByRole("button", { name }).element());

  await screen.getByRole("button", { name: "Save changes" }).hover();
  await expect
    .poll(() => style("Save changes").backgroundColor)
    .toBe(colourOf("--bg-hover"));
  // Space held down is a press that lasts.
  await userEvent.tab();
  await userEvent.keyboard("{Space>}");
  await expect
    .poll(() => style("Save changes").backgroundColor)
    .toBe(colourOf("--bg-active"));
  await userEvent.keyboard("{/Space}");

  await screen.getByRole("button", { name: "Delete example" }).hover();
  await expect
    .poll(() => style("Delete example").borderTopColor)
    .toBe(colourOf("--err-fg"));

  await screen.getByRole("button", { name: "Read more" }).hover();
  await expect
    .poll(() => style("Read more").textDecorationLine)
    .toBe("underline");
});

// The tint of the soft destructive button is translucent. Laid over the
// opaque surface it gives its text the same ground wherever the button
// stands; alone it would let a row under the pointer through, where the
// text is below 4.5:1.
test("lays the tint of the soft destructive look over an opaque fill", async () => {
  const screen = await render(
    <>
      <Button tone="danger">Delete example</Button>
      <p>Somewhere else</p>
    </>,
  );
  await screen.getByText("Somewhere else").hover();
  const style = getComputedStyle(
    screen.getByRole("button", { name: "Delete example" }).element(),
  );
  const tint = colourOf("--err-bg");

  expect(style.backgroundColor).toBe(colourOf("--bg-surface"));
  expect(style.backgroundImage).toContain("linear-gradient");
  expect(style.backgroundImage.split(tint)).toHaveLength(3);
});

// An icon is sized by the size of its button, and it is decoration: the
// name of the button stays its text.
test("draws its icons beside the text and keeps them out of its name", async () => {
  const screen = await render(
    <Button icon="search" iconEnd="chevronDown" size="lg">
      Example actions
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Example actions" });
  const icons = [...button.element().querySelectorAll("svg")];

  expect(icons).toHaveLength(2);
  const [before, after] = icons;
  expect(before?.getAttribute("aria-hidden")).toBe("true");
  expect(before?.getBoundingClientRect().width).toBe(16);
  expect(before?.nextSibling?.textContent).toBe("Example actions");
  expect(after?.previousSibling?.textContent).toBe("Example actions");
});

// The four heights of a control, at the browser's default font size.
test("is as high as its size says", async () => {
  const screen = await render(
    <>
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button>Medium</Button>
      <Button size="lg">Large</Button>
    </>,
  );
  const height = (name: string) =>
    screen.getByRole("button", { name }).element().getBoundingClientRect()
      .height;

  expect(height("Extra small")).toBe(24);
  expect(height("Small")).toBe(28);
  expect(height("Medium")).toBe(32);
  expect(height("Large")).toBe(36);
});

// A contrast theme of the system removes every fill, and with it all that
// tells a primary or a text button from the text around it. It paints
// every border in a colour of its own, a transparent one too, which is
// why each look has a border.
test("has a boundary when the system forces its colours", async () => {
  const screen = await render(
    <>
      {pairs.map(({ variant, tone }) => (
        <Button key={`${variant} ${tone}`} variant={variant} tone={tone}>
          {`Example ${variant} ${tone}`}
        </Button>
      ))}
    </>,
  );
  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  for (const { variant, tone } of pairs) {
    const style = getComputedStyle(
      screen
        .getByRole("button", { name: `Example ${variant} ${tone}` })
        .element(),
    );
    expect(style.borderTopWidth, `${variant} ${tone}`).toBe("1px");
    expect(style.borderTopStyle, `${variant} ${tone}`).toBe("solid");
    // No longer the transparent border of the look: the system's colour.
    expect(style.borderTopColor, `${variant} ${tone}`).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
  }
});
