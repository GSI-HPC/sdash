// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { storageKey as characterKeysKey } from "../shortcuts/ShortcutsProvider";
import { settled } from "../testing/app";
import { renderWithShortcuts } from "../testing/shortcuts";
import {
  shownTooltipElements,
  shownTooltips,
  tooltips,
} from "../testing/tooltips";
import { Button } from "./Button";
import { Dialog, DialogTitle } from "./Dialog";
import { NestedPopups, PopupContainer } from "./popups";
import { Tooltip, type TooltipProps } from "./Tooltip";

// What a tooltip does by itself. How the tooltips of the shell keep to
// their controls, when a list scrolls or the window changes size, is in
// layout/RailTooltips.browser.test.tsx.

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1280, 720);
});

// The files of a run share the stored preferences of one browser, and one
// test here switches the single-key shortcuts off.
afterEach(() => {
  localStorage.clear();
});

/**
 * A control that shows a sign and no word, with its name as a tooltip, and
 * a text beside it for the pointer to rest on. The tests of a file share
 * one pointer, which the test before may have left on a control.
 */
function Page(props: Partial<TooltipProps>) {
  return (
    <>
      <Tooltip label="Save changes" {...props}>
        <button type="button" aria-label="Save changes" className="m-24">
          S
        </button>
      </Tooltip>
      <button type="button">Another control</button>
      <p>Somewhere else</p>
    </>
  );
}

/** Renders the tree and takes the pointer off every control. */
async function renderAway(tree: ReactNode) {
  const screen = await render(tree);
  await screen.getByText("Somewhere else").hover();
  await expect.poll(shownTooltips).toEqual([]);
  return screen;
}

// A tooltip that came up the moment the pointer crossed a control would
// flicker along a row of them. It waits until the pointer rests.
test("shows under the pointer after its delay and goes when the pointer leaves", async () => {
  const screen = await renderAway(<Page />);
  const control = screen.getByRole("button", { name: "Save changes" });
  // Both moments are taken on the page, so that the time the test needs to
  // talk to the browser is not part of what is measured.
  let entered = NaN;
  let appeared = NaN;
  control.element().addEventListener(
    "mouseenter",
    () => {
      entered = performance.now();
    },
    { once: true },
  );
  const observer = new MutationObserver(() => {
    if (Number.isNaN(appeared) && shownTooltips().length > 0) {
      appeared = performance.now();
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  await control.hover();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
  observer.disconnect();
  expect(appeared - entered).toBeGreaterThanOrEqual(250);

  await screen.getByText("Somewhere else").hover();
  await expect.poll(shownTooltips).toEqual([]);
});

// A keyboard user has no pointer to rest, and waits for nothing. A click
// gives the focus too, and a tooltip that came up under the pointer after
// every click would be noise: it shows for the focus the browser draws a
// ring for.
test("shows at once on keyboard focus and not on the focus of a click", async () => {
  const screen = await renderAway(<Page />);
  const control = screen.getByRole("button", { name: "Save changes" });

  await userEvent.tab();
  await expect.element(control).toHaveFocus();
  expect(shownTooltips()).toEqual(["Save changes"]);

  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual([]);

  await control.click();
  await expect.element(control).toHaveFocus();
  // Longer than the delay: the pointer is still on the control.
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(shownTooltips()).toEqual([]);
});

// WCAG 2.1, success criterion 1.4.13: someone who enlarges a part of the
// screen has to be able to move the pointer onto what appeared without
// losing it.
test("stays while the pointer is on it", async () => {
  const screen = await renderAway(<Page />);
  await screen.getByRole("button", { name: "Save changes" }).hover();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
  const [tooltip] = shownTooltipElements();
  if (!tooltip) {
    throw new Error("no tooltip shows");
  }

  await userEvent.hover(tooltip);
  await new Promise((resolve) => setTimeout(resolve, 300));

  expect(shownTooltips()).toEqual(["Save changes"]);
  expect(tooltip.matches(":hover")).toBe(true);
});

// The same criterion: what appeared can be put away without moving the
// pointer or the focus.
test("goes on Escape and leaves the focus where it was", async () => {
  const screen = await renderAway(<Page />);
  const control = screen.getByRole("button", { name: "Save changes" });
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);

  await userEvent.keyboard("{Escape}");

  await expect.poll(shownTooltips).toEqual([]);
  await expect.element(control).toHaveFocus();
});

// Read as well, the name would be said twice.
test("is hidden from assistive technology when it repeats the name of its control", async () => {
  const screen = await renderAway(<Page />);
  const control = screen.getByRole("button", { name: "Save changes" });
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);

  const [tooltip] = shownTooltipElements();
  expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  expect(tooltip?.hasAttribute("role")).toBe(false);
  expect(screen.getByRole("tooltip").elements()).toEqual([]);
  await expect.element(control).toHaveAccessibleName("Save changes");
  await expect.element(control).toHaveAccessibleDescription("");
});

// The reason a control cannot be used is no part of its name. A screen
// reader reads it with the control, and does not wait for a tooltip that a
// pointer or a sighted user's focus brings up.
test("describes its control to assistive technology whether it shows or not", async () => {
  const reason = "There is nothing to save yet.";
  const screen = await renderAway(<Page kind="description" label={reason} />);
  const control = screen.getByRole("button", { name: "Save changes" });

  expect(shownTooltips()).toEqual([]);
  await expect.element(control).toHaveAccessibleDescription(reason);
  await expect.element(control).toHaveAccessibleName("Save changes");

  await userEvent.tab();
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent(reason);
  await expect.element(control).toHaveAccessibleDescription(reason);
});

test("adds its description to one its control already has", async () => {
  const screen = await renderAway(
    <>
      <Tooltip kind="description" label="There is nothing to save yet.">
        <button type="button" aria-describedby="note">
          Save changes
        </button>
      </Tooltip>
      <p id="note">Saved a minute ago.</p>
      <p>Somewhere else</p>
    </>,
  );

  await expect
    .element(screen.getByRole("button", { name: "Save changes" }))
    .toHaveAccessibleDescription(
      "Saved a minute ago. There is nothing to save yet.",
    );
});

// A control must not advertise a key the user has switched off (WCAG 2.1,
// success criterion 2.1.4).
test("shows the key of a shortcut beside its label, and none while single-key shortcuts are off", async () => {
  const first = await renderWithShortcuts(<Page keys="s" />);
  await first.getByText("Somewhere else").hover();
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Save changess"]);
  const [tooltip] = shownTooltipElements();
  expect(tooltip?.querySelector("kbd")?.textContent).toBe("s");
  // The key is for the eye: the control tells assistive technology.
  expect(
    tooltip?.querySelector("kbd")?.closest("[aria-hidden='true']"),
  ).not.toBeNull();
  await first.unmount();

  localStorage.setItem(characterKeysKey, "off");
  await renderWithShortcuts(<Page keys="s" />);
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
  expect(shownTooltipElements()[0]?.querySelector("kbd")).toBeNull();
});

// An item of the sidebar shows its name as a tooltip in the rail alone.
// One that was up when the sidebar expanded must not be there again,
// beside a control nobody points at, when the rail is back.
test("shows nothing while it is disabled, and is not back when it is enabled with the focus still on its control", async () => {
  const screen = await renderAway(<Page />);
  const control = screen.getByRole("button", { name: "Save changes" });
  await userEvent.tab();
  await expect.element(control).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);

  await screen.rerender(<Page disabled />);
  await expect.poll(shownTooltips).toEqual([]);

  // Entered anew while it is disabled: on to the next control and back,
  // which keeps the focus on the page. Backwards from the first control the
  // focus leaves the page, and whether the next Tab brings it back is up to
  // the browser around the page: a Chromium with the controls of a window
  // hands it back, and the headless shell that CI runs has none and does
  // not.
  await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
  await expect.element(control).toHaveFocus();
  await settled();
  expect(shownTooltips()).toEqual([]);

  await screen.rerender(<Page />);
  await settled();
  expect(shownTooltips()).toEqual([]);
  await expect.element(control).toHaveFocus();

  // The premise: it works again once its control is entered anew.
  await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
  await expect.element(control).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
});

test("stands below its control unless told another side", async () => {
  const screen = await renderAway(<Page />);
  const control = screen.getByRole("button", { name: "Save changes" });
  const box = () => shownTooltipElements()[0]?.getBoundingClientRect();
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
  await expect
    .poll(() => box()?.top)
    .toBeGreaterThanOrEqual(control.element().getBoundingClientRect().bottom);

  await screen.rerender(<Page side="right" />);

  await expect
    .poll(() => box()?.left)
    .toBeGreaterThanOrEqual(control.element().getBoundingClientRect().right);
});

// On the body a tooltip is content in no landmark. The shell has a place
// for popups inside its main region, and what opens from inside an
// overlay stays with the overlay.
test("opens in the place the page has for popups, and inside an overlay it is opened from", async () => {
  function WithPlace({ nested }: { nested: boolean }) {
    const [place, setPlace] = useState<HTMLElement | null>(null);
    const page = <Page />;
    return (
      <PopupContainer element={place}>
        {nested ? <NestedPopups>{page}</NestedPopups> : page}
        <div ref={setPlace} data-testid="place" />
      </PopupContainer>
    );
  }
  const screen = await renderAway(<WithPlace nested={false} />);
  const place = screen.getByTestId("place").element();
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
  expect(place.contains(shownTooltipElements()[0] ?? null)).toBe(true);

  // The page is rendered anew inside the overlay, and the focus with it.
  await screen.rerender(<WithPlace nested />);
  await expect.poll(shownTooltips).toEqual([]);
  screen.getByRole("button", { name: "Another control" }).element().focus();
  await userEvent.tab({ shift: true });
  await expect.poll(shownTooltips).toEqual(["Save changes"]);
  expect(place.contains(shownTooltipElements()[0] ?? null)).toBe(false);
});

// Escape belongs to what is on top. A tooltip that let the key through
// would take the dialog with it, and the user who only wanted the tooltip
// out of the way would lose what they were doing. The three cases are
// the three ways the key travels: to the control of the tooltip, to
// another control while the pointer rests on the tooltip's, and to a
// button that is disabled, which passes on no key it is given.
test.each(["the focus", "the pointer", "a disabled button"] as const)(
  "leaves a dialog open when Escape closes it inside one, shown by %s",
  async (shownBy) => {
    let closed = 0;
    const screen = await render(
      <Dialog
        open
        onClose={() => {
          closed += 1;
        }}
        className="w-100"
      >
        <DialogTitle>Example dialog</DialogTitle>
        <button type="button">First control</button>
        <Tooltip
          label="Save changes"
          kind={shownBy === "a disabled button" ? "description" : "label"}
        >
          {shownBy === "a disabled button" ? (
            <Button disabled focusableWhenDisabled>
              Example action
            </Button>
          ) : (
            <button type="button" aria-label="Save changes" className="m-8">
              S
            </button>
          )}
        </Tooltip>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Example dialog" });
    const first = screen.getByRole("button", { name: "First control" });
    await expect.element(first).toHaveFocus();
    if (shownBy === "the pointer") {
      await screen.getByRole("button", { name: "Save changes" }).hover();
    } else {
      await userEvent.tab();
    }
    await expect.poll(shownTooltips).toEqual(["Save changes"]);
    // Over the dialog, and not under it.
    const [tooltip] = shownTooltipElements();
    const box = tooltip?.getBoundingClientRect();
    expect(
      tooltip?.contains(
        document.elementFromPoint(
          ((box?.left ?? NaN) + (box?.right ?? NaN)) / 2,
          ((box?.top ?? NaN) + (box?.bottom ?? NaN)) / 2,
        ),
      ),
    ).toBe(true);

    await userEvent.keyboard("{Escape}");
    await expect.poll(shownTooltips).toEqual([]);
    await settled();
    expect(closed).toBe(0);
    await expect.element(dialog).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.poll(() => closed).toBe(1);
  },
);

// The pointer can rest on one control while another has the focus, and
// the key then goes to the other.
test("goes on Escape while the pointer rests on a control that does not have the focus", async () => {
  const screen = await renderAway(<Page />);
  const other = screen.getByRole("button", { name: "Another control" });
  other.element().focus();
  await screen.getByRole("button", { name: "Save changes" }).hover();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);

  await userEvent.keyboard("{Escape}");

  await expect.poll(shownTooltips).toEqual([]);
  await expect.element(other).toHaveFocus();
});

/**
 * Two controls with a tooltip each, far enough apart that the pointer
 * rests on one alone: one that says why it does nothing, as a button that
 * is disabled with a reason does, and one that shows a sign and its name.
 */
function TwoControls() {
  return (
    <>
      <button type="button">First control</button>
      <Tooltip kind="description" label="Nothing has changed yet.">
        <button type="button" className="m-24">
          Save changes
        </button>
      </Tooltip>
      <Tooltip label="Search examples">
        <button type="button" aria-label="Search examples" className="m-24">
          S
        </button>
      </Tooltip>
      <p>Somewhere else</p>
    </>
  );
}

// A tooltip stays for as long as what brought it up does (WCAG 2.1,
// success criterion 1.4.13). Base UI shows one tooltip at a time, also
// without its provider: the reason a control gave on keyboard focus went
// when the pointer came to rest on another control, and was not back when
// the pointer left, with the focus where it was.
test("stays on the control the keyboard focus is on while the pointer shows the tooltip of another", async () => {
  const screen = await renderAway(<TwoControls />);
  const save = screen.getByRole("button", { name: "Save changes" });
  const search = screen.getByRole("button", { name: "Search examples" });
  screen.getByRole("button", { name: "First control" }).element().focus();
  await userEvent.tab();
  await expect.element(save).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Nothing has changed yet."]);

  await search.hover();

  await expect
    .poll(shownTooltips)
    .toEqual(["Nothing has changed yet.", "Search examples"]);

  // The pointer leaves: its tooltip goes, the other stays with the focus.
  await screen.getByText("Somewhere else").hover();
  await expect.poll(shownTooltips).toEqual(["Nothing has changed yet."]);
  await settled();
  expect(shownTooltips()).toEqual(["Nothing has changed yet."]);

  // And goes with the focus.
  await userEvent.tab();
  await expect.element(search).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Search examples"]);
});

// The pointer passes over the control that has the focus on its way
// somewhere else. The focus has not moved, and neither has its tooltip.
test("stays on the control the keyboard focus is on when the pointer passes over that control", async () => {
  const screen = await renderAway(<TwoControls />);
  const save = screen.getByRole("button", { name: "Save changes" });
  screen.getByRole("button", { name: "First control" }).element().focus();
  await userEvent.tab();
  await expect.element(save).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Nothing has changed yet."]);

  await save.hover();
  await settled();
  await screen.getByText("Somewhere else").hover();
  await settled();

  expect(shownTooltips()).toEqual(["Nothing has changed yet."]);
  await userEvent.keyboard("{Escape}");
  await expect.poll(shownTooltips).toEqual([]);
});

// The other way round: the tooltip under the pointer stays while the
// keyboard brings up the one of another control, and one Escape puts both
// away.
test("stays under the pointer while the keyboard focus shows the tooltip of another control", async () => {
  const screen = await renderAway(<TwoControls />);
  const save = screen.getByRole("button", { name: "Save changes" });
  await screen.getByRole("button", { name: "Search examples" }).hover();
  await expect.poll(shownTooltips).toEqual(["Search examples"]);

  screen.getByRole("button", { name: "First control" }).element().focus();
  await userEvent.tab();
  await expect.element(save).toHaveFocus();

  await expect
    .poll(shownTooltips)
    .toEqual(["Nothing has changed yet.", "Search examples"]);

  await userEvent.keyboard("{Escape}");
  await expect.poll(shownTooltips).toEqual([]);
  await expect.element(save).toHaveFocus();
});

// A tooltip follows its control and is hidden once the control is scrolled
// out of sight, where it is still open. Escape is the tooltip's only while
// the tooltip can be seen: a key that did nothing a user can see, in front
// of a dialog that then stayed open, was the first of two presses.
test("leaves Escape to the dialog once its control is scrolled out of sight", async () => {
  let closed = 0;
  const lines = Array.from({ length: 40 }, (_, index) => index + 1);
  const screen = await render(
    <Dialog
      open
      onClose={() => {
        closed += 1;
      }}
      className="w-100"
    >
      <DialogTitle>Example dialog</DialogTitle>
      <div data-testid="scrolls" className="h-40 overflow-auto">
        <button type="button">First control</button>
        <Tooltip label="Save changes">
          <button type="button" aria-label="Save changes">
            S
          </button>
        </Tooltip>
        {lines.map((line) => (
          <p key={line}>Line {line} of the example</p>
        ))}
      </div>
    </Dialog>,
  );
  const control = screen.getByRole("button", { name: "Save changes" });
  // Forwards from the control before it, as the Tab key does: a tooltip
  // shows on the focus of the keyboard.
  screen.getByRole("button", { name: "First control" }).element().focus();
  await userEvent.tab();
  await expect.element(control).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Save changes"]);

  screen.getByTestId("scrolls").element().scrollTo(0, 2000);
  await expect.poll(shownTooltips).toEqual([]);
  // The premise: the tooltip is still open, and only hidden.
  expect(tooltips().some((tooltip) => tooltip.checkVisibility())).toBe(true);

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => closed).toBe(1);
});

// A path or an id is one word, and a tooltip is no wider than 256 px: the
// word has to break where the tooltip ends, or it runs out of it.
test("breaks a label that is one long word", async () => {
  const word = "example".repeat(10);
  const screen = await renderAway(<Page label={word} />);
  screen.getByRole("button", { name: "Another control" }).element().focus();
  await userEvent.tab({ shift: true });
  await expect.poll(shownTooltips).toEqual([word]);

  const [tooltip] = shownTooltipElements();
  if (!tooltip) {
    throw new Error("no tooltip shows");
  }
  const box = tooltip.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(tooltip);
  const text = range.getBoundingClientRect();
  expect(box.width).toBeLessThanOrEqual(256);
  expect(text.right).toBeLessThanOrEqual(box.right);
  expect(text.left).toBeGreaterThanOrEqual(box.left);
  // The premise: it took more than one line.
  expect(text.height).toBeGreaterThan(20);
});
