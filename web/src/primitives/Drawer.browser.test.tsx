// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { settled } from "../testing/app";
import { colourOf } from "../testing/colours";
import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { askForLessMotion } from "../testing/system";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog, DialogTitle } from "./Dialog";
import { Drawer, DrawerBody, DrawerHeader } from "./Drawer";
import { Menu, MenuItem } from "./Menu";
import { PopupContainer } from "./popups";
import { Select } from "./Select";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1280, 720);
});

/** Some lines of text, more than a low window has room for. */
function Lines({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <p key={index}>Line {index + 1} of the example</p>
  ));
}

/**
 * A page with a button that opens a drawer. `onClosed` is told each time
 * the drawer asks to be closed.
 */
function Page({
  onClosed,
  children,
}: {
  onClosed?: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open drawer
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          onClosed?.();
          setOpen(false);
        }}
      >
        <DrawerHeader
          eyebrow="Example"
          title="Example details"
          meta="Changed a minute ago"
          actions={<Button>First action</Button>}
        />
        <DrawerBody>{children ?? <p>What the example is about.</p>}</DrawerBody>
      </Drawer>
    </>
  );
}

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

/** Opens the drawer from the keyboard. */
async function openByKeyboard(screen: Awaited<ReturnType<typeof render>>) {
  const opener = screen.getByRole("button", { name: "Open drawer" });
  opener.element().focus();
  await userEvent.keyboard("{Enter}");
  const drawer = screen.getByRole("dialog", { name: "Example details" });
  await expect.element(drawer).toBeVisible();
  // Until it has slid in, its place on the screen is not the one it keeps.
  await expect
    .poll(() => drawer.element().getBoundingClientRect().right)
    .toBe(window.innerWidth);
  return { opener, drawer };
}

// A screen reader reads the name of what has the focus. On the drawer
// itself it reads the name of the drawer and starts at its top.
test("is a dialog named by its title that takes the focus", async () => {
  const screen = await render(<Page />);

  const { drawer } = await openByKeyboard(screen);

  await expect.element(drawer).toHaveFocus();
  await expect
    .element(drawer.getByRole("heading", { name: "Example details" }))
    .toBeVisible();
  // The ring is inside the edge of the drawer, where it can be seen.
  const style = getComputedStyle(drawer.element());
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineOffset).toBe("-2px");
  // The page behind is out of reach of assistive technology for as long.
  expect(
    screen.getByRole("button", { name: "Open drawer" }).elements(),
  ).toEqual([]);
});

test("keeps the focus inside and gives it back when it closes", async () => {
  const screen = await render(<Page />);
  const { opener, drawer } = await openByKeyboard(screen);
  const close = drawer.getByRole("button", { name: "Close" });
  const action = drawer.getByRole("button", { name: "First action" });

  await userEvent.tab();
  await expect.element(close).toHaveFocus();
  await userEvent.tab();
  await expect.element(action).toHaveFocus();
  await userEvent.tab();
  await expect.element(close).toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(action).toHaveFocus();

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => drawer.elements()).toEqual([]);
  await expect.element(opener).toHaveFocus();
});

test("closes on Escape, on its close button and on a press outside it", async () => {
  let closed = 0;
  const screen = await render(
    <Page
      onClosed={() => {
        closed += 1;
      }}
    />,
  );
  const { drawer } = await openByKeyboard(screen);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => drawer.elements()).toEqual([]);
  expect(closed).toBe(1);

  await openByKeyboard(screen);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => drawer.elements()).toEqual([]);
  expect(closed).toBe(2);

  // On the scrim, left of the drawer.
  await openByKeyboard(screen);
  await userEvent.click(document.body, { position: { x: 100, y: 400 } });
  await expect.poll(() => drawer.elements()).toEqual([]);
  expect(closed).toBe(3);
});

/**
 * A header as the shell has one: as high as the scrim leaves free, in a
 * layer of its own above the page, with a control that counts its presses.
 */
function ShellHeader({ onPress }: { onPress: () => void }) {
  return (
    <header className="relative z-20 flex h-13 items-center bg-base px-4">
      <button type="button" onClick={onPress}>
        In the header
      </button>
    </header>
  );
}

/** The middle of the control of that header, hidden or not. */
function headerControl(): { x: number; y: number } {
  const control = document.querySelector("header button");
  if (!control) {
    throw new Error("the page has no header");
  }
  const box = control.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// The header of the shell stays in sight above the scrim. It lies in a
// layer above the one Base UI catches a press outside with, so nothing of
// Base UI's keeps the pointer from it: a control in it would answer, and
// the focus would follow the press out of the drawer and into a page that
// is hidden from a screen reader.
test("keeps a press from the header of the shell, which closes the drawer instead", async () => {
  let pressed = 0;
  let closed = 0;
  const screen = await render(
    <>
      <ShellHeader
        onPress={() => {
          pressed += 1;
        }}
      />
      <Page
        onClosed={() => {
          closed += 1;
        }}
      />
    </>,
  );
  const { opener, drawer } = await openByKeyboard(screen);

  await userEvent.click(document.body, { position: headerControl() });

  await expect.poll(() => drawer.elements()).toEqual([]);
  expect(pressed).toBe(0);
  expect(closed).toBe(1);
  await expect.element(opener).toHaveFocus();
  // The premise: the control does answer once the drawer has gone.
  await userEvent.click(document.body, { position: headerControl() });
  expect(pressed).toBe(1);
});

// The part of the drawer that takes such a press reaches over the header:
// the press is that part's own, and does not rest on the page being inert
// alone.
test("covers the header of the shell with the part that takes a press outside", async () => {
  const screen = await render(
    <>
      <ShellHeader onPress={() => undefined} />
      <Page />
    </>,
  );
  const { drawer } = await openByKeyboard(screen);
  const { x, y } = headerControl();

  const hit = document
    .elementsFromPoint(x, y)
    .find((element) => !element.closest("[inert]"));

  expect(hit?.contains(drawer.element())).toBe(true);
  // And the drawer itself still starts below the header.
  expect(drawer.element().getBoundingClientRect().top).toBe(52);
});

// A modal overlay keeps the focus inside by turning the Tab key round at
// its edges, which holds only while the focus is inside. So the page
// behind is inert, the header with it: nothing in it takes the focus or a
// press, whatever brought the focus out of the drawer.
test("makes the page behind it inert for as long as it is open", async () => {
  const screen = await render(
    <>
      <ShellHeader onPress={() => undefined} />
      <Page />
    </>,
  );
  // Kept as an element: once the page is inert the button has no role to
  // find it by.
  const button = screen.getByRole("button", { name: "Open drawer" }).element();
  const { opener, drawer } = await openByKeyboard(screen);
  const header = document.querySelector("header");

  await expect.poll(() => header?.closest("[inert]") ?? null).not.toBeNull();
  expect(button.closest("[inert]")).not.toBeNull();
  expect(drawer.element().closest("[inert]")).toBeNull();
  // What is inert cannot take the focus, by a script either.
  (button as HTMLElement).focus();
  await expect.element(drawer).toHaveFocus();

  await userEvent.keyboard("{Escape}");

  // Not until the drawer has slid out: the page is in reach the moment the
  // drawer is closed.
  expect(button.closest("[inert]")).toBeNull();
  expect(header?.closest("[inert]") ?? null).toBeNull();
  await expect.poll(() => drawer.elements()).toEqual([]);
  await expect.element(opener).toHaveFocus();
});

/**
 * A page with a drawer, and a dialog that opens over the drawer without
 * being part of it, as the command palette does. Either can be closed
 * while the other stays.
 */
function PageWithTwo() {
  const [drawer, setDrawer] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setDrawer(true);
        }}
      >
        Open drawer
      </Button>
      <Drawer
        open={drawer}
        onClose={() => {
          setDrawer(false);
        }}
      >
        <DrawerHeader title="Example details" />
        <DrawerBody>
          <Button
            onClick={() => {
              setOver(true);
            }}
          >
            Open dialog
          </Button>
        </DrawerBody>
      </Drawer>
      <Dialog
        open={over}
        onClose={() => {
          setOver(false);
        }}
        className="w-100"
      >
        <DialogTitle>Example dialog</DialogTitle>
        <Button
          onClick={() => {
            setDrawer(false);
          }}
        >
          Close the drawer
        </Button>
      </Dialog>
    </>
  );
}

/**
 * Opens the drawer of that page and the dialog over it, by the keyboard.
 * Returns the button of the page and the one inside the drawer as
 * elements: behind an overlay neither has a role to find it by.
 */
async function openBoth(screen: Awaited<ReturnType<typeof render>>) {
  const behind = screen.getByRole("button", { name: "Open drawer" }).element();
  const { drawer } = await openByKeyboard(screen);
  const inside = drawer.getByRole("button", { name: "Open dialog" }).element();
  (inside as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");
  const dialog = screen.getByRole("dialog", { name: "Example dialog" });
  await expect
    .element(dialog.getByRole("button", { name: "Close the drawer" }))
    .toHaveFocus();
  // The premise: the dialog keeps the drawer out of reach, and the page
  // with it.
  expect(inside.closest("[inert]")).not.toBeNull();
  expect(behind.closest("[inert]")).not.toBeNull();
  return { behind, inside, drawer, dialog };
}

// Two overlays can be open at once, and both keep the page out of reach.
// The one that closes must let go of what it alone held, the drawer under
// it, and not of the page, which the drawer still holds.
test("keeps the page behind it inert when a dialog that opened over it has closed", async () => {
  const screen = await render(<PageWithTwo />);
  const { behind, inside, drawer, dialog } = await openBoth(screen);

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(inside.closest("[inert]")).toBeNull();
  expect(behind.closest("[inert]")).not.toBeNull();
  // What is inert cannot take the focus, by a script either: it is back
  // in the drawer and stays there.
  await expect.poll(() => document.activeElement).toBe(inside);
  (behind as HTMLElement).focus();
  expect(document.activeElement).toBe(inside);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => drawer.elements()).toEqual([]);
  expect(document.querySelector("[inert]")).toBeNull();
});

// Either can go first: a drawer is kept in the address, and the browser's
// Back closes it under a palette that stays open. The dialog on top still
// holds the page.
test("leaves the page inert for a dialog that is still open over it when it closes first", async () => {
  const screen = await render(<PageWithTwo />);
  const { behind, dialog } = await openBoth(screen);

  await userEvent.keyboard("{Enter}");

  // The drawer has left the page, and of the two dialogs one is there.
  // They are counted on the page itself: under the dialog the drawer is
  // hidden from a search by role.
  await expect
    .poll(() => document.querySelectorAll("[role='dialog']").length)
    .toBe(1);
  await expect.element(dialog).toBeVisible();
  expect(behind.closest("[inert]")).not.toBeNull();

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(document.querySelector("[inert]")).toBeNull();
});

// The button that closes the drawer says by which key the same is done.
test("names the key that closes it on its close button", async () => {
  const screen = await render(<Page />);
  const { drawer } = await openByKeyboard(screen);
  const close = drawer.getByRole("button", { name: "Close" });

  await userEvent.tab();
  await expect.element(close).toHaveFocus();

  await expect.element(close).toHaveAttribute("aria-keyshortcuts", "Escape");
  await expect.poll(shownTooltips).toEqual(["CloseEsc"]);
});

// The handoff sets the line above the title and the line below it in
// --t3, which stands 4.75:1 on the surface of the drawer in the light
// theme (doc/ui.md, "Colours").
test("sets the lines above and below its title in --t3", async () => {
  const screen = await render(<Page />);
  const { drawer } = await openByKeyboard(screen);

  for (const line of ["Example", "Changed a minute ago"]) {
    const element = drawer.getByText(line, { exact: true }).element();
    expect(getComputedStyle(element).color, line).toBe(colourOf("--t3"));
  }
});

// The handoff draws the drawer below the header, which stays in sight.
test("lies at the right edge of the window, below the header of the shell", async () => {
  const screen = await render(<Page />);
  const { drawer } = await openByKeyboard(screen);

  const box = drawer.element().getBoundingClientRect();
  expect(box.top).toBe(52);
  expect(box.bottom).toBe(720);
  expect(box.right).toBe(1280);
  expect(box.width).toBe(580);
});

// The drawer takes 300 ms to slide out. Escape and then a key of the page
// is what a user in a hurry types: the keys are the page's the moment the
// drawer is closed, not when the last of it has left the screen.
test("is on the page until it has slid out, and the keys are the page's from the moment it closes", async () => {
  const log: Log = [];
  const screen = await renderWithShortcuts(
    <Registers shortcuts={[logging(log, "x", "page")]}>
      <Page>
        <input aria-label="Example field" />
        <Registers shortcuts={[logging(log, "y", "drawer")]} />
      </Page>
    </Registers>,
  );
  const { drawer } = await openByKeyboard(screen);
  const field = drawer.getByRole("textbox", { name: "Example field" });
  field.element().focus();
  await expect.element(field).toHaveFocus();
  // While it is open the keys of the page rest.
  (document.activeElement as HTMLElement).blur();
  await userEvent.keyboard("xy");
  expect(log).toEqual(["drawer"]);
  field.element().focus();

  await userEvent.keyboard("{Escape}");
  await userEvent.keyboard("x");

  expect(log).toEqual(["drawer", "page"]);
  // The premise: the drawer was still on its way out when the key ran,
  // and the key was not typed into its field.
  const leaving = document.querySelector("[role='dialog']");
  expect(leaving).not.toBeNull();
  expect(leaving?.querySelector("input")?.value).toBe("");
  expect(leaving?.contains(document.activeElement)).toBe(false);
  await expect.poll(() => document.querySelector("[role='dialog']")).toBeNull();
});

// 320 px is the width WCAG 2.1 measures reflow at (success criterion
// 1.4.10).
test("is as wide as the window on a narrow screen", async () => {
  await page.viewport(320, 600);
  const screen = await render(<Page />);
  const { drawer } = await openByKeyboard(screen);

  const box = drawer.element().getBoundingClientRect();
  expect(box.left).toBe(0);
  expect(box.width).toBe(320);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  await expect
    .element(drawer.getByRole("button", { name: "Close" }))
    .toBeInViewport({ ratio: 1 });
});

test("scrolls its body below a header that stays, and the body takes the focus to be scrolled", async () => {
  const screen = await render(
    <Page>
      <Lines count={80} />
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  const body = drawer
    .getByText("Line 1 of the example", { exact: true })
    .element().parentElement?.parentElement;
  if (!body) {
    throw new Error("the drawer has no body");
  }
  await expect.poll(() => body.tabIndex).toBe(0);

  // Close, the action, and then the body.
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(body);
  // A stop of the Tab key says what it is: a group, named as the drawer.
  await expect
    .element(drawer.getByRole("group", { name: "Example details" }))
    .toHaveFocus();
  await userEvent.keyboard("{End}");

  await expect.poll(() => body.scrollTop).toBeGreaterThan(0);
  await expect
    .element(drawer.getByText("Line 80 of the example", { exact: true }))
    .toBeInViewport({ ratio: 1 });
  await expect
    .element(drawer.getByRole("heading", { name: "Example details" }))
    .toBeInViewport({ ratio: 1 });
});

// The body is a stop of the Tab key, and a group with a name, for as long
// as it scrolls. Once the window is high enough for all of it, the stop
// would do nothing, and the group would only say the name of the drawer a
// second time on the way in.
test("is no stop of the Tab key and no group once its body has nothing left to scroll", async () => {
  await page.viewport(1280, 520);
  const screen = await render(
    <Page>
      <Lines count={20} />
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  const body = drawer
    .getByText("Line 1 of the example", { exact: true })
    .element().parentElement?.parentElement;
  if (!body) {
    throw new Error("the drawer has no body");
  }
  // The premise: it scrolls, and is a group named as the drawer.
  await expect.poll(() => body.tabIndex).toBe(0);
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  expect(body.getAttribute("role")).toBe("group");
  expect(drawer.getByRole("group", { name: "Example details" }).element()).toBe(
    body,
  );

  await page.viewport(1280, 1000);

  await expect.poll(() => body.tabIndex).toBe(-1);
  expect(body.scrollHeight).toBe(body.clientHeight);
  expect(body.hasAttribute("role")).toBe(false);
  expect(body.hasAttribute("aria-labelledby")).toBe(false);
  // Close, the action, and round to Close again, past the body.
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  await expect
    .element(drawer.getByRole("button", { name: "Close" }))
    .toHaveFocus();
});

// A window 256 px high is one of 1024 px enlarged to four times its size.
// The header alone would fill it, so there the whole drawer scrolls.
test("can be scrolled to its end by the keyboard in a low window", async () => {
  await page.viewport(640, 256);
  const screen = await render(
    <Page>
      <Lines count={30} />
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  const last = drawer.getByText("Line 30 of the example", { exact: true });
  await expect.element(last).not.toBeInViewport();

  // The part that scrolls is no stop of the Tab key itself: it would be
  // one without a role and without a name. Chromium, which runs this test,
  // makes a stop of what scrolls only where there is no control inside,
  // and Safari never does. Firefox does so for whatever scrolls and
  // carries no tabindex attribute, so the attribute is what is asked for.
  const scroller = scrollerOf(last.element());
  expect(scroller).not.toBe(drawer.element());
  expect(drawer.element().contains(scroller)).toBe(true);
  expect(scroller.getAttribute("tabindex")).toBe("-1");
  // A press on its text still gives it the focus, and its ring would be
  // beyond the window at two sides if it were not drawn inside.
  expect(getComputedStyle(scroller).outlineOffset).toBe("-2px");

  // Onto the first control inside, which is what the keys then scroll
  // around.
  await userEvent.tab();
  await expect
    .element(drawer.getByRole("button", { name: "Close" }))
    .toHaveFocus();
  await userEvent.keyboard("{End}");

  await expect.element(last).toBeInViewport({ ratio: 1 });
  // The header went up with the rest and left the room to the content.
  await expect
    .element(drawer.getByRole("heading", { name: "Example details" }))
    .not.toBeInViewport();
});

// A browser scrolls to the control that takes the focus: Chromium and
// Safari whenever a part of it is out of sight, Firefox only when none of
// it is in sight, which leaves a button that lies across the edge of the
// body where it is. Chromium runs this test, so the focus is given without
// a scroll, which is what Firefox makes of it there.
test("brings a button that takes the focus half out of sight into sight in full", async () => {
  const screen = await render(
    <Page>
      <Lines count={40} />
      <Button>Last action</Button>
      <Lines count={40} />
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  const action = drawer
    .getByRole("button", { name: "Last action" })
    .element() as HTMLElement;
  const body = scrollerOf(action);
  const edge = () => body.getBoundingClientRect().bottom;
  // The premise: the lower half of the button is below the edge of the
  // body.
  body.scrollTop += Math.round(
    action.getBoundingClientRect().top + action.offsetHeight / 2 - edge(),
  );
  expect(action.getBoundingClientRect().top).toBeLessThan(edge());
  expect(action.getBoundingClientRect().bottom).toBeGreaterThan(edge() + 4);

  action.focus({ preventScroll: true });

  expect(document.activeElement).toBe(action);
  expect(action.matches(":focus-visible")).toBe(true);
  // All of it, but for the part of a pixel a scroll position rounds away.
  expect(action.getBoundingClientRect().bottom).toBeLessThanOrEqual(edge() + 1);
});

test("shows the tabs in its header and the panel in its body", async () => {
  function Tabbed() {
    const [tab, setTab] = useState<"first" | "second">("first");
    return (
      <Drawer open onClose={() => undefined}>
        <Tabs value={tab} onValueChange={setTab} className="contents">
          <DrawerHeader title="Example details">
            <TabList label="Parts of the example">
              <Tab value="first">First tab</Tab>
              <Tab value="second">Second tab</Tab>
            </TabList>
          </DrawerHeader>
          <DrawerBody>
            <TabPanel value="first">
              <Lines count={80} />
            </TabPanel>
            <TabPanel value="second">The second panel</TabPanel>
          </DrawerBody>
        </Tabs>
      </Drawer>
    );
  }
  const screen = await render(<Tabbed />);
  const drawer = screen.getByRole("dialog", { name: "Example details" });
  await expect
    .poll(() => drawer.element().getBoundingClientRect().right)
    .toBe(window.innerWidth);
  const list = drawer.getByRole("tablist", { name: "Parts of the example" });
  const heading = drawer.getByRole("heading", { name: "Example details" });
  const panel = drawer.getByRole("tabpanel");

  // The list is in the header: below the title, above the panel, and its
  // line is the line of the header, which spans the drawer.
  const header = heading.element().closest(".border-b");
  expect(header).not.toBeNull();
  const listBox = list.element().getBoundingClientRect();
  const headerBox = header?.getBoundingClientRect();
  expect(listBox.top).toBeGreaterThan(
    heading.element().getBoundingClientRect().bottom,
  );
  expect(Math.abs(listBox.bottom - (headerBox?.bottom ?? NaN))).toBeLessThan(
    0.5,
  );
  expect(headerBox?.width).toBe(
    drawer.element().getBoundingClientRect().width - 1,
  );
  expect(panel.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    listBox.bottom,
  );

  // The body still scrolls under the header, with the tabs around both.
  const body = panel.element().parentElement?.parentElement;
  expect(body?.scrollHeight).toBeGreaterThan(body?.clientHeight ?? NaN);
  expect(headerBox?.bottom).toBeLessThan(300);

  await drawer.getByRole("tab", { name: "Second tab" }).click();
  await expect.element(panel).toHaveTextContent("The second panel");
});

// The handoff draws the drawer without motion. It slides here, and its
// scrim fades, in the time and on the one easing the handoff has for the
// sidebar (doc/ui.md lists the departure). A user who asked the system for
// less motion gets the drawer at once.
test("slides in 300 ms on the easing of the handoff, and not at all for a user who asked for less motion", async () => {
  const screen = await render(<Page />);
  const { drawer } = await openByKeyboard(screen);
  const easing = "cubic-bezier(0.32, 0.72, 0, 1)";
  const style = getComputedStyle(drawer.element());
  expect(style.transitionProperty).toContain("transform");
  expect(style.transitionDuration).toBe("0.3s");
  expect(style.transitionTimingFunction).toBe(easing);
  // The scrim, which is what lies right under the part of the drawer that
  // covers the window.
  const [, scrim] = document.elementsFromPoint(5, 400);
  const fade = scrim ? getComputedStyle(scrim) : null;
  expect(fade?.transitionProperty).toBe("opacity");
  expect(fade?.transitionDuration).toBe("0.3s");
  expect(fade?.transitionTimingFunction).toBe(easing);

  await askForLessMotion(true);
  try {
    // The premise: the page sees the setting.
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    expect(getComputedStyle(drawer.element()).transitionProperty).toBe("none");
  } finally {
    await askForLessMotion(false);
  }
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
// drawer's scrim. The tooltip of the drawer's own close button belongs to
// the drawer and lies over it.
test("keeps what opens from inside it out of the page's place for popups", async () => {
  const screen = await render(
    <WithPlace>
      <Page />
    </WithPlace>,
  );
  const place = screen.getByTestId("place").element();
  const { drawer } = await openByKeyboard(screen);

  await userEvent.tab();
  await expect
    .element(drawer.getByRole("button", { name: "Close" }))
    .toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["CloseEsc"]);
  const [tooltip] = shownTooltipElements();
  expect(place.contains(tooltip ?? null)).toBe(false);
  const box = tooltip?.getBoundingClientRect();
  expect(
    tooltip?.contains(
      document.elementFromPoint(
        ((box?.left ?? NaN) + (box?.right ?? NaN)) / 2,
        ((box?.top ?? NaN) + (box?.bottom ?? NaN)) / 2,
      ),
    ),
  ).toBe(true);
});

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

// Base UI would put the list of a select beside the drawer, in no
// landmark and in no dialog. It is inside the drawer, where a user who
// moves by landmarks finds it and where a drag of the mouse over it is no
// swipe that closes the drawer.
test("holds what opens from inside it, below the control that opened it", async () => {
  const screen = await render(
    <Page>
      <ExampleChoice />
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  const select = drawer.getByRole("combobox", { name: "Example choice" });
  select.element().focus();
  await userEvent.keyboard("{Enter}");
  const list = screen.getByRole("listbox", { name: "Example choice" });
  await expect.element(list).toBeVisible();

  expect(drawer.element().contains(list.element())).toBe(true);
  expect(list.element().closest("[data-drawer-content]")).not.toBeNull();
  // The drawer is moved by a transform, which changes what "fixed to the
  // window" means for everything inside it: the list is still where it
  // belongs, under its field and as wide.
  const field = select.element().getBoundingClientRect();
  const box = list.element().getBoundingClientRect();
  expect(Math.abs(box.left - field.left)).toBeLessThanOrEqual(1);
  expect(box.top - field.bottom).toBeGreaterThanOrEqual(0);
  expect(box.top - field.bottom).toBeLessThanOrEqual(8);
  expect(Math.abs(box.width - field.width)).toBeLessThanOrEqual(1);

  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(select).toHaveTextContent("Second option");
  await expect.element(select).toHaveFocus();
  await expect.element(drawer).toBeVisible();
});

// A confirmation that opens from the drawer lies over the drawer, and
// dims it as it dims the page: Base UI would leave the scrim of a dialog
// out when the dialog is opened from inside another.
test("is dimmed by a confirmation that opens from inside it", async () => {
  function Asks() {
    const [asking, setAsking] = useState(false);
    return (
      <>
        <Button
          onClick={() => {
            setAsking(true);
          }}
        >
          Delete example
        </Button>
        <ConfirmDialog
          open={asking}
          title="Delete the example?"
          request={{ method: "DELETE", path: "/example" }}
          confirmLabel="Delete example"
          danger
          onConfirm={() => {
            setAsking(false);
          }}
          onCancel={() => {
            setAsking(false);
          }}
        />
      </>
    );
  }
  const screen = await render(
    <Page>
      <Asks />
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  // The elements, found now: behind the confirmation the drawer is hidden
  // from assistive technology, and so from a search by role.
  const panel = drawer.element();
  const title = drawer
    .getByRole("heading", { name: "Example details" })
    .element();
  /** What the pointer would meet on the title of the drawer. */
  const overTitle = () => {
    const box = title.getBoundingClientRect();
    return document.elementFromPoint(box.left + 4, box.top + 4);
  };
  expect(panel.contains(overTitle())).toBe(true);

  drawer.getByRole("button", { name: "Delete example" }).element().focus();
  await userEvent.keyboard("{Enter}");
  const confirmation = screen.getByRole("alertdialog");
  await expect
    .element(confirmation.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();

  const over = overTitle();
  expect(panel.contains(over)).toBe(false);
  expect(over && getComputedStyle(over).backgroundColor).toBe(
    colourOf("--scrim"),
  );

  // Cancelled, the drawer is as it was, with the focus back on its
  // button.
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => confirmation.elements()).toEqual([]);
  await expect
    .element(drawer.getByRole("button", { name: "Delete example" }))
    .toHaveFocus();
  expect(panel.contains(overTitle())).toBe(true);
});

// A menu that closes takes the entry that has the focus off the page and
// then gives the focus to its button. A drawer that sees the focus vanish
// from inside itself takes it, onto itself: the place of the popups keeps
// that from happening (OverlayPopups in popups.tsx).
test("leaves the focus on the button of a menu that closes inside it", async () => {
  const screen = await render(
    <Page>
      <Menu trigger={<Button>Actions</Button>}>
        <MenuItem>First action</MenuItem>
      </Menu>
    </Page>,
  );
  const { drawer } = await openByKeyboard(screen);
  const trigger = drawer.getByRole("button", { name: "Actions" });
  trigger.element().focus();

  await userEvent.keyboard("{Enter}");
  const menu = screen.getByRole("menu", { name: "Actions" });
  await expect
    .element(menu.getByRole("menuitem", { name: "First action" }))
    .toHaveFocus();
  expect(drawer.element().contains(menu.element())).toBe(true);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => menu.elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();
  // The drawer would take the focus a frame later.
  await settled();
  await expect.element(trigger).toHaveFocus();
  await expect.element(drawer).toBeVisible();
});
