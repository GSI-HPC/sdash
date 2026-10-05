// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { settled } from "../testing/app";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { Button } from "./Button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./Dialog";
import { IconButton } from "./IconButton";
import { Menu, MenuItem } from "./Menu";
import { Popover } from "./Popover";
import { PopupContainer } from "./popups";
import { PrimitivesProvider } from "./PrimitivesProvider";
import { Select } from "./Select";
import { useToast } from "./Toast";
import { Tooltip } from "./Tooltip";

// What the dialog does by itself. Its part in the shortcuts, and that the
// keys of the page are back the moment it closes, is in
// shortcuts/scopes.browser.test.tsx; the dialogs of the shell are in the
// tests of the palette and of the help.

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1280, 720);
});

/**
 * A page with a button that opens a dialog in its standard form.
 * `onClosed` is told each time the dialog asks to be closed.
 */
function Page({
  onClosed,
  focusOn,
  children,
}: {
  onClosed?: () => void;
  focusOn?: "save";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const initialFocus: { initialFocus?: RefObject<HTMLElement | null> } =
    focusOn === "save" ? { initialFocus: saveRef } : {};
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          onClosed?.();
          setOpen(false);
        }}
        {...initialFocus}
        placement="middle"
        className="w-140"
      >
        <DialogHeader
          title="Example dialog"
          description="What the example is about."
        />
        <DialogBody className="flex flex-col gap-3">{children}</DialogBody>
        <DialogFooter note="Nothing is sent.">
          <DialogClose render={<Button>Cancel</Button>} />
          <Button ref={saveRef} variant="primary">
            Save changes
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

/** Opens the dialog from the keyboard, as a user who will get the focus back. */
async function openByKeyboard(screen: Awaited<ReturnType<typeof render>>) {
  const opener = screen.getByRole("button", { name: "Open dialog" });
  opener.element().focus();
  await userEvent.keyboard("{Enter}");
  const dialog = screen.getByRole("dialog", { name: "Example dialog" });
  await expect.element(dialog).toBeVisible();
  return { opener, dialog };
}

test("is a dialog named by its title and described by its description", async () => {
  const screen = await render(<Page />);

  const { dialog } = await openByKeyboard(screen);

  await expect
    .element(dialog)
    .toHaveAccessibleDescription("What the example is about.");
  // The title is a heading, the first of the dialog.
  await expect
    .element(dialog.getByRole("heading", { level: 2, name: "Example dialog" }))
    .toBeVisible();
  // The page behind is out of reach of assistive technology for as long.
  expect(
    screen.getByRole("button", { name: "Open dialog" }).elements(),
  ).toEqual([]);
});

// The head of a dialog as the handoff draws it.
test("sets the text that says what it is about 6 px below its title", async () => {
  const screen = await render(<Page />);
  const { dialog } = await openByKeyboard(screen);

  const title = dialog
    .getByRole("heading", { name: "Example dialog" })
    .element()
    .getBoundingClientRect();
  const text = dialog
    .getByText("What the example is about.")
    .element()
    .getBoundingClientRect();
  expect(text.top - title.bottom).toBe(6);
});

// A keyboard user must not end up in the page behind, which they cannot
// see, and must find the focus where they left it.
test("keeps the focus inside and gives it back to what had it", async () => {
  const screen = await render(<Page />);
  const { opener, dialog } = await openByKeyboard(screen);
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const save = dialog.getByRole("button", { name: "Save changes" });
  await expect.element(cancel).toHaveFocus();

  await userEvent.tab();
  await expect.element(save).toHaveFocus();
  await userEvent.tab();
  await expect.element(cancel).toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(save).toHaveFocus();

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  await expect.element(opener).toHaveFocus();
});

test("starts with the focus on the control it is told to", async () => {
  const screen = await render(<Page focusOn="save" />);

  const { dialog } = await openByKeyboard(screen);

  await expect
    .element(dialog.getByRole("button", { name: "Save changes" }))
    .toHaveFocus();
});

test("closes on Escape, on a press outside and by a button made for that", async () => {
  let closed = 0;
  const screen = await render(
    <Page
      onClosed={() => {
        closed += 1;
      }}
    />,
  );
  const { dialog } = await openByKeyboard(screen);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(closed).toBe(1);

  await openByKeyboard(screen);
  // On the scrim, in a corner of the window the dialog does not reach.
  await userEvent.click(document.body, { position: { x: 10, y: 10 } });
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(closed).toBe(2);

  await openByKeyboard(screen);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(closed).toBe(3);
});

/** A button of the page that shows a toast which stays. */
function ShowsFailure() {
  const toast = useToast();
  return (
    <Button
      onClick={() => {
        toast.show({ tone: "err", title: "Changes not saved" });
      }}
    >
      Show a failure
    </Button>
  );
}

// The Tab key is turned round at the edges of a dialog, which holds only
// while the focus is inside. The page behind is inert as well, so that
// nothing in it takes the focus or a press, whatever brought the focus out
// of the dialog.
test("makes the page behind it inert for as long as it is open", async () => {
  const screen = await render(<Page />);
  // Kept as an element: once the page is inert the button has no role to
  // find it by.
  const button = screen.getByRole("button", { name: "Open dialog" }).element();
  const { opener, dialog } = await openByKeyboard(screen);

  await expect.poll(() => button.closest("[inert]")).not.toBeNull();
  expect(dialog.element().closest("[inert]")).toBeNull();
  // What is inert cannot take the focus, by a script either.
  const focused = document.activeElement;
  (button as HTMLElement).focus();
  expect(document.activeElement).toBe(focused);

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(button.closest("[inert]")).toBeNull();
  await expect.element(opener).toHaveFocus();
});

// A toast reports what the dialog did, and its button takes the focus when
// it is pressed and then goes with the toast. The toasts stay in reach
// beside an open dialog, and from the page, where the focus is left, the
// Tab key must not find the controls behind the dialog.
test("keeps the Tab key out of the page after a toast was dismissed beside it", async () => {
  const screen = await render(
    <PrimitivesProvider>
      <ShowsFailure />
      <Page />
    </PrimitivesProvider>,
  );
  const behind = [
    screen.getByRole("button", { name: "Show a failure" }).element(),
    screen.getByRole("button", { name: "Open dialog" }).element(),
  ];
  await screen.getByRole("button", { name: "Show a failure" }).click();
  const toasts = screen.getByRole("region", { name: "Notifications" });
  await expect
    .element(toasts.getByRole("dialog", { name: "Changes not saved" }))
    .toBeVisible();
  const { dialog } = await openByKeyboard(screen);
  await expect.poll(() => behind[0]?.closest("[inert]")).not.toBeNull();
  expect(toasts.element().closest("[inert]")).toBeNull();

  await toasts.getByRole("button", { name: "Dismiss" }).click();
  await expect.poll(() => toasts.getByRole("dialog").elements()).toEqual([]);
  await expect.element(dialog).toBeVisible();

  // Backwards and forwards, the focus is never on a control of the page.
  for (const shift of [true, true, false, false, false]) {
    await userEvent.tab({ shift });
    expect(behind).not.toContain(document.activeElement);
  }
  // And the Tab key has brought it back into the dialog.
  await expect
    .poll(() => dialog.element().contains(document.activeElement))
    .toBe(true);
});

/**
 * A field that takes the focus as React puts it on the page, as a field
 * with autoFocus does: before the browser draws, and before any effect
 * that waits for that.
 */
function TakesTheFocusOnArrival() {
  const fieldRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    fieldRef.current?.focus();
  }, []);
  return <input ref={fieldRef} aria-label="Next step" />;
}

// The page behind is in reach again in the very step that closes the
// dialog, not once the browser has drawn that step: what arrives with the
// step and takes the focus as it arrives is given it before then, and an
// inert element cannot take it. The focus would be left to Base UI, which
// puts it back on the control that opened the dialog.
test("lets a field that arrives in the step that closes it take the focus", async () => {
  function Steps() {
    const [step, setStep] = useState<"start" | "asked" | "next">("start");
    return (
      <>
        <Button
          onClick={() => {
            setStep("asked");
          }}
        >
          Open dialog
        </Button>
        {step === "next" && <TakesTheFocusOnArrival />}
        <Dialog
          open={step === "asked"}
          onClose={() => {
            setStep("start");
          }}
          className="w-100"
        >
          <DialogTitle>Example dialog</DialogTitle>
          <Button
            onClick={() => {
              setStep("next");
            }}
          >
            Carry on
          </Button>
        </Dialog>
      </>
    );
  }
  const screen = await render(<Steps />);
  // Kept as an element: once the page is inert the button has no role to
  // find it by.
  const opener = screen.getByRole("button", { name: "Open dialog" }).element();
  const { dialog } = await openByKeyboard(screen);
  await expect
    .element(dialog.getByRole("button", { name: "Carry on" }))
    .toHaveFocus();
  // The premise: the page is inert, and the field arrives beside the
  // button that opened the dialog.
  expect(opener.closest("[inert]")).not.toBeNull();

  await userEvent.keyboard("{Enter}");

  const field = screen.getByRole("textbox", { name: "Next step" });
  await expect.element(field).toHaveFocus();
  // And Base UI, which gives the focus back once the dialog has left,
  // leaves it there.
  await expect.poll(() => dialog.elements()).toEqual([]);
  await settled();
  await expect.element(field).toHaveFocus();
});

// A dialog stands in the middle of the window's width, and either hangs
// near its top, as the palette does, or stands in the middle of its
// height, as a confirmation does. Neither is done with a transform, which
// would hold and cut off what opens from inside the dialog.
test.each([
  { placement: "top", from: 0.12 * 720 },
  { placement: "middle", from: null },
] as const)(
  "stands in the middle of the width, and at the $placement of the window when told so",
  async ({ placement, from }) => {
    function Placed() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Open dialog
          </Button>
          <Dialog
            open={open}
            onClose={() => {
              setOpen(false);
            }}
            placement={placement}
            className="w-100"
          >
            <DialogHeader title="Example dialog" />
            <DialogFooter>
              <DialogClose render={<Button>Close</Button>} />
            </DialogFooter>
          </Dialog>
        </>
      );
    }
    const screen = await render(<Placed />);
    const { dialog } = await openByKeyboard(screen);

    const box = dialog.element().getBoundingClientRect();
    expect(box.width).toBe(400);
    expect(Math.abs((box.left + box.right) / 2 - 1280 / 2)).toBeLessThan(1);
    if (from === null) {
      expect(Math.abs((box.top + box.bottom) / 2 - 720 / 2)).toBeLessThan(1);
    } else {
      expect(Math.abs(box.top - from)).toBeLessThan(1);
    }
    expect(getComputedStyle(dialog.element()).transform).toBe("none");
  },
);

/** A select of three options that keeps its choice. */
function ExampleChoice() {
  const [choice, setChoice] = useState<"first" | "second" | "third">("first");
  return (
    <Select
      label="Example choice"
      options={[
        { value: "first", label: "First option" },
        { value: "second", label: "Second option" },
        { value: "third", label: "Third option" },
      ]}
      value={choice}
      onValueChange={setChoice}
    />
  );
}

/** Whether the element is what the pointer would meet in its middle. */
function onTop(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return element.contains(
    document.elementFromPoint(
      (box.left + box.right) / 2,
      (box.top + box.bottom) / 2,
    ),
  );
}

// What opens from inside a dialog belongs to the dialog: it lies over it,
// can be used, and Escape closes it and not the dialog below.
test("lets a select, a menu and a tooltip inside it open, and Escape closes them first", async () => {
  let closed = 0;
  const ran: string[] = [];
  const screen = await render(
    <Page
      onClosed={() => {
        closed += 1;
      }}
    >
      <ExampleChoice />
      <div className="flex gap-2">
        <Menu trigger={<Button iconEnd="chevronDown">Actions</Button>}>
          <MenuItem onClick={() => ran.push("first")}>First action</MenuItem>
          <MenuItem onClick={() => ran.push("second")}>Second action</MenuItem>
        </Menu>
        <Tooltip kind="description" label="There is nothing to copy yet.">
          <Button focusableWhenDisabled disabled>
            Copy example
          </Button>
        </Tooltip>
      </div>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);

  // The select.
  const select = dialog.getByRole("combobox", { name: "Example choice" });
  await expect.element(select).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  const list = screen.getByRole("listbox");
  const firstOption = list.getByRole("option", { name: "First option" });
  await expect.element(firstOption).toHaveFocus();
  expect(onTop(firstOption.element())).toBe(true);
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => list.elements()).toEqual([]);
  await expect.element(select).toHaveFocus();
  expect(closed).toBe(0);
  await userEvent.keyboard("{Enter}");
  await expect.element(firstOption).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(select).toHaveTextContent("Second option");
  await expect.element(select).toHaveFocus();

  // The menu.
  await userEvent.tab();
  const actions = dialog.getByRole("button", { name: "Actions" });
  await expect.element(actions).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  const menu = screen.getByRole("menu", { name: "Actions" });
  const first = menu.getByRole("menuitem", { name: "First action" });
  await expect.element(first).toHaveFocus();
  expect(onTop(first.element())).toBe(true);
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => menu.elements()).toEqual([]);
  await expect.element(actions).toHaveFocus();
  expect(closed).toBe(0);
  await userEvent.keyboard("{Enter}");
  await expect.element(first).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(ran).toEqual(["second"]);
  await expect.element(actions).toHaveFocus();

  // The tooltip.
  await userEvent.tab();
  await expect.poll(shownTooltips).toEqual(["There is nothing to copy yet."]);
  await userEvent.keyboard("{Escape}");
  await expect.poll(shownTooltips).toEqual([]);
  await settled();
  expect(closed).toBe(0);
  await expect.element(dialog).toBeVisible();

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(closed).toBe(1);
});

/** A select with more options than a dialog around it is high. */
function LongChoice() {
  const [choice, setChoice] = useState("1");
  return (
    <Select
      label="Example choice"
      options={Array.from({ length: 12 }, (_, index) => ({
        value: String(index + 1),
        label: `Option ${String(index + 1)}`,
      }))}
      value={choice}
      onValueChange={setChoice}
    />
  );
}

// Base UI would put the list of a select beside the dialog, in no
// landmark and in no dialog, where a user who moves by landmarks does not
// come by and the accessibility scan reports it. It is inside the dialog,
// and still not cut off where the dialog ends, as the dialog cuts off
// everything else that reaches beyond its rounded corners.
test("holds what opens from inside it, and does not cut it off at its edge", async () => {
  const screen = await render(
    <Page>
      <LongChoice />
      <Tooltip kind="description" label="There is nothing to copy yet.">
        <Button focusableWhenDisabled disabled>
          Copy example
        </Button>
      </Tooltip>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);
  await userEvent.keyboard("{Enter}");
  const list = screen.getByRole("listbox", { name: "Example choice" });
  await expect.element(list).toBeVisible();
  expect(dialog.element().contains(list.element())).toBe(true);

  await userEvent.keyboard("{End}");
  const last = list.getByRole("option", { name: "Option 12" });
  await expect.element(last).toHaveFocus();
  // The premise: the last option lies below the dialog.
  expect(last.element().getBoundingClientRect().top).toBeGreaterThan(
    dialog.element().getBoundingClientRect().bottom,
  );
  expect(onTop(last.element())).toBe(true);
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => list.elements()).toEqual([]);

  // The reason of a button is there to be read whether it shows or not,
  // and is inside the dialog as well.
  const reason = screen.getByRole("tooltip", { includeHidden: true });
  expect(dialog.element().contains(reason.element())).toBe(true);
});

// A popup that closes takes the control that has the focus off the page
// and then gives the focus to its button. A dialog that sees the focus
// vanish from inside itself takes it, onto itself: the place of the popups
// keeps that from happening (OverlayPopups in popups.tsx).
test("leaves the focus on the button of a popover that closes inside it", async () => {
  const screen = await render(
    <Page>
      <Popover
        trigger={<Button>Example settings</Button>}
        title="Example settings"
      >
        <div className="p-3">
          <Button>First control</Button>
        </div>
      </Popover>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);
  const trigger = dialog.getByRole("button", { name: "Example settings" });
  await expect.element(trigger).toHaveFocus();

  await userEvent.keyboard("{Enter}");
  const popover = screen.getByRole("dialog", { name: "Example settings" });
  await expect
    .element(popover.getByRole("button", { name: "First control" }))
    .toHaveFocus();
  expect(dialog.element().contains(popover.element())).toBe(true);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => popover.elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();
  // The dialog would take the focus a frame later.
  await settled();
  await expect.element(trigger).toHaveFocus();
  await expect.element(dialog).toBeVisible();
});

/** The nearest element around the given one that scrolls its content. */
function scrollerOf(element: Element): HTMLElement {
  for (
    let around = element.parentElement;
    around;
    around = around.parentElement
  ) {
    if (around.scrollHeight > around.clientHeight) {
      return around;
    }
  }
  throw new Error("nothing around the element scrolls");
}

// In a low window, which is what an enlarged page is, a dialog is no
// higher than the window leaves room for. Its head and its buttons stay,
// and what is between them scrolls, from the keyboard too where it holds
// no control (WCAG 2.1, success criteria 1.4.10 and 2.1.1).
test("scrolls its body by the keyboard when the body is higher than the dialog", async () => {
  await page.viewport(640, 360);
  const lines = Array.from({ length: 30 }, (_, index) => index + 1);
  const screen = await render(
    <Page>
      {lines.map((line) => (
        <p key={line}>Line {line} of the example</p>
      ))}
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);

  const frame = dialog.element().getBoundingClientRect();
  expect(frame.top).toBeGreaterThanOrEqual(0);
  expect(frame.bottom).toBeLessThanOrEqual(360);
  await expect
    .element(dialog.getByRole("button", { name: "Save changes" }))
    .toBeInViewport({ ratio: 1 });
  const body = scrollerOf(
    dialog.getByText("Line 1 of the example", { exact: true }).element(),
  );
  expect(dialog.element().contains(body)).toBe(true);
  // The body is a stop of the Tab key, before the buttons.
  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
  await expect.poll(() => body.tabIndex).toBe(0);
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(body);
  // A stop of the Tab key says what it is: a group, named as the dialog.
  await expect
    .element(dialog.getByRole("group", { name: "Example dialog" }))
    .toHaveFocus();
  const style = getComputedStyle(body);
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineOffset).toBe("-2px");

  await userEvent.keyboard("{End}");

  await expect.poll(() => body.scrollTop).toBeGreaterThan(0);
  await expect
    .element(dialog.getByText("Line 30 of the example"))
    .toBeInViewport({ ratio: 1 });
});

test("is no stop of the Tab key in its body while the body has nothing to scroll", async () => {
  const screen = await render(
    <Page>
      <p>One line of the example</p>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);

  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect.element(cancel).toHaveFocus();
  const body = dialog.getByText("One line of the example").element()
    .parentElement?.parentElement;
  await settled();
  expect(body?.tabIndex).toBe(-1);
  // Nobody stops on it, so it is no group either: a screen reader would
  // say the name of the dialog twice on the way in.
  expect(body?.hasAttribute("role")).toBe(false);
  expect(body?.hasAttribute("aria-labelledby")).toBe(false);
  // Backwards from the first button the focus goes to the last, past the
  // body.
  await userEvent.tab({ shift: true });
  await expect
    .element(dialog.getByRole("button", { name: "Save changes" }))
    .toHaveFocus();
});

// 320 by 256 px is a window of 1280 by 1024 px enlarged to four times its
// size, where WCAG 2.1 measures reflow (success criterion 1.4.10). There
// the head of a dialog and its buttons, which go on in a second line, are
// higher together than the dialog may be. Nothing of it may be cut off for
// good: the dialog scrolls as a whole, and its body keeps room for a
// field.
test("scrolls as a whole in a window too low for its head and its buttons", async () => {
  await page.viewport(320, 256);
  const screen = await render(
    <Page>
      <label>
        First field <input />
      </label>
      <label>
        Second field <input />
      </label>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);
  const frame = dialog.element();

  const box = frame.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(256);
  // The premise: its content is higher than it is.
  expect(frame.scrollHeight).toBeGreaterThan(frame.clientHeight);
  expect(getComputedStyle(frame).overflowY).toBe("auto");
  const body = scrollerOf(dialog.getByText("First field").element());
  expect(body).not.toBe(frame);
  expect(body.clientHeight).toBeGreaterThanOrEqual(56);

  // Every control can be brought on the screen in full, the last button
  // too, and the way back to the top is open.
  const save = dialog.getByRole("button", { name: "Save changes" });
  (save.element() as HTMLElement).focus();
  await expect.element(save).toBeInViewport({ ratio: 1 });
  const edge = frame.getBoundingClientRect();
  const button = save.element().getBoundingClientRect();
  expect(button.bottom).toBeLessThanOrEqual(edge.bottom);
  expect(button.top).toBeGreaterThanOrEqual(edge.top);
  frame.scrollTo(0, 0);
  await expect
    .element(dialog.getByRole("heading", { name: "Example dialog" }))
    .toBeInViewport({ ratio: 1 });
});

// A browser scrolls to the control that takes the focus: Chromium and
// Safari whenever a part of it is out of sight, Firefox only when none of
// it is in sight, which leaves a button that lies across the edge of the
// dialog where it is, cut off with its ring. Chromium runs these tests, so
// the focus is given without a scroll, which is what Firefox makes of it
// there.

/** A dialog in a window too low for it, with three fields in its body. */
async function openLow() {
  await page.viewport(320, 256);
  const screen = await render(
    <Page>
      <label>
        First field <input />
      </label>
      <label>
        Second field <input />
      </label>
      <label>
        Third field <input />
      </label>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);
  const frame = dialog.element();
  const save = dialog
    .getByRole("button", { name: "Save changes" })
    .element() as HTMLElement;
  /** Where the dialog cuts its content off at the bottom. */
  const edge = () =>
    frame.getBoundingClientRect().top + frame.clientTop + frame.clientHeight;
  /** Puts the middle of the last button on that edge. */
  const halfOut = () => {
    frame.scrollTop += Math.round(
      save.getBoundingClientRect().top + save.offsetHeight / 2 - edge(),
    );
    // The premise: the lower half of the button is below the edge.
    expect(save.getBoundingClientRect().top).toBeLessThan(edge());
    expect(save.getBoundingClientRect().bottom).toBeGreaterThan(edge() + 4);
  };
  return { dialog, frame, save, edge, halfOut };
}

test("brings a button that takes the focus half out of sight into sight in full", async () => {
  const { save, edge, halfOut } = await openLow();
  halfOut();

  save.focus({ preventScroll: true });

  expect(document.activeElement).toBe(save);
  expect(save.matches(":focus-visible")).toBe(true);
  // All of it, but for the part of a pixel a scroll position rounds away.
  expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(edge() + 1);
});

// What the dialog adds stops where the browsers agree. A control nothing
// of which is in sight is scrolled to by every engine, which puts it where
// its user is used to finding it. And a button that a press of the mouse
// gave the focus has no ring to show, and must not move under the pointer.
test("scrolls to nothing that is out of sight altogether, or that the pointer gave the focus", async () => {
  const { dialog, frame, save, halfOut } = await openLow();
  const third = dialog
    .getByRole("textbox", { name: "Third field" })
    .element() as HTMLElement;
  const body = scrollerOf(third);
  expect(body).not.toBe(frame);
  frame.scrollTop = 0;
  body.scrollTop = 0;
  expect(third.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    body.getBoundingClientRect().bottom,
  );

  third.focus({ preventScroll: true });

  expect(document.activeElement).toBe(third);
  expect([frame.scrollTop, body.scrollTop]).toEqual([0, 0]);

  // A press on the title gives the focus to the dialog, without a ring,
  // and what a script gives the focus next has none either: the stand-in
  // for a press on the button itself, which the test could only make by
  // scrolling the button into sight first.
  await dialog.getByRole("heading", { name: "Example dialog" }).click();
  halfOut();
  const scrolled = frame.scrollTop;

  save.focus({ preventScroll: true });

  expect(document.activeElement).toBe(save);
  expect(save.matches(":focus-visible")).toBe(false);
  expect(frame.scrollTop).toBe(scrolled);
});

// 320 px is the width WCAG 2.1 measures reflow at. The note and the two
// buttons of the foot have no room in one row there.
test("goes on with its buttons in a second line where one row is too narrow", async () => {
  await page.viewport(320, 640);
  const screen = await render(<Page />);
  const { dialog } = await openByKeyboard(screen);

  const frame = dialog.element().getBoundingClientRect();
  const cancel = dialog
    .getByRole("button", { name: "Cancel" })
    .element()
    .getBoundingClientRect();
  const save = dialog
    .getByRole("button", { name: "Save changes" })
    .element()
    .getBoundingClientRect();
  const note = dialog
    .getByText("Nothing is sent.")
    .element()
    .getBoundingClientRect();
  for (const part of [note, cancel, save]) {
    expect(part.left).toBeGreaterThanOrEqual(frame.left);
    expect(part.right).toBeLessThanOrEqual(frame.right);
  }
  // The premise: they are not in one row.
  expect(save.top).toBeGreaterThanOrEqual(note.bottom);
});

// The palette opens over whatever is on the page, a dialog of a view too.
// When it closes, the user is back in the dialog they were in.
test("gives the focus back into a dialog when one that opened over it closes", async () => {
  function Second() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Open second
        </Button>
        <Dialog
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          className="w-100"
        >
          <DialogTitle>Second dialog</DialogTitle>
          <Button>Only control</Button>
        </Dialog>
      </>
    );
  }
  const screen = await render(
    <Page>
      <Second />
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);
  const openSecond = dialog.getByRole("button", { name: "Open second" });
  await expect.element(openSecond).toHaveFocus();

  await userEvent.keyboard("{Enter}");
  const second = screen.getByRole("dialog", { name: "Second dialog" });
  await expect
    .element(second.getByRole("button", { name: "Only control" }))
    .toHaveFocus();

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => second.elements()).toEqual([]);
  await expect.element(openSecond).toHaveFocus();
  await expect.element(dialog).toBeVisible();
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

// The shell has a place for the popups of the page, which lies under the
// dialogs. A tooltip put there from inside a dialog would be behind the
// scrim, and hidden from assistive technology with the page.
test("keeps what opens from inside it out of the page's place for popups", async () => {
  const screen = await render(
    <WithPlace>
      <Page>
        <IconButton icon="check" label="Apply example" />
      </Page>
    </WithPlace>,
  );
  const place = screen.getByTestId("place").element();
  const { dialog } = await openByKeyboard(screen);
  await expect
    .element(dialog.getByRole("button", { name: "Apply example" }))
    .toHaveFocus();

  await expect.poll(shownTooltips).toEqual(["Apply example"]);
  const [tooltip] = shownTooltipElements();
  expect(place.contains(tooltip ?? null)).toBe(false);
  expect(tooltip ? onTop(tooltip) : false).toBe(true);
  expect(tooltip?.closest("[inert]")).toBeNull();
});
