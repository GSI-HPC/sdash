// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { settled } from "../testing/app";
import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Popover, PopoverClose, type PopoverProps } from "./Popover";
import { PopupContainer } from "./popups";

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1280, 720);
});

/**
 * A popover with two controls in it, and a control after its trigger for
 * the Tab key to go on to.
 */
function Page(props: Partial<PopoverProps>) {
  return (
    <>
      <Popover
        trigger={<Button>Example settings</Button>}
        title="Example settings"
        description="What the example shows."
        className="w-72"
        {...props}
      >
        <div className="flex gap-2 px-3.5 pb-3">
          <Button>First control</Button>
          <PopoverClose render={<Button variant="primary">Done</Button>} />
        </div>
        {props.children}
      </Popover>
      <Button>Next control</Button>
    </>
  );
}

test("opens on a press of its trigger and is a dialog named by its title", async () => {
  const screen = await render(<Page />);
  const popover = screen.getByRole("dialog", { name: "Example settings" });
  expect(popover.elements()).toEqual([]);

  await screen.getByRole("button", { name: "Example settings" }).click();

  await expect.element(popover).toBeVisible();
  await expect
    .element(popover)
    .toHaveAccessibleDescription("What the example shows.");
  // A dialog that is not modal: the page around it stays in reach.
  expect(popover.element().getAttribute("aria-modal")).toBeNull();
  expect(document.querySelector("[aria-hidden='true'] button")).toBeNull();
});

// A popover that came up under the pointer would take the keys from the
// page whenever the pointer crossed its trigger.
test("stays closed while the pointer only rests on its trigger", async () => {
  const screen = await render(<Page />);

  await screen.getByRole("button", { name: "Example settings" }).hover();
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(screen.getByRole("dialog").elements()).toEqual([]);
});

test("keeps a title that is not shown for assistive technology", async () => {
  const screen = await render(<Page titleHidden />);

  await screen.getByRole("button", { name: "Example settings" }).click();

  const popover = screen.getByRole("dialog", { name: "Example settings" });
  await expect.element(popover).toBeVisible();
  const title = popover.getByRole("heading", { name: "Example settings" });
  await expect.element(title).toBeInTheDocument();
  const box = title.element().getBoundingClientRect();
  expect(box.width).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(1);
});

// A keyboard user who opened it is in it, and need not look for it.
test("takes the focus inside when it opens", async () => {
  const screen = await render(<Page />);
  const trigger = screen.getByRole("button", { name: "Example settings" });

  trigger.element().focus();
  await userEvent.keyboard("{Enter}");

  await expect
    .element(screen.getByRole("button", { name: "First control" }))
    .toHaveFocus();
});

test("closes on Escape and gives the focus back to its trigger", async () => {
  const screen = await render(<Page />);
  const trigger = screen.getByRole("button", { name: "Example settings" });
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();
});

test("is closed by a button made for that, which gives the focus back too", async () => {
  const screen = await render(<Page />);
  const trigger = screen.getByRole("button", { name: "Example settings" });
  await trigger.click();

  await screen.getByRole("button", { name: "Done" }).click();

  await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  await expect.element(trigger).toHaveFocus();
});

// It is not modal: the Tab key goes through it and on to what follows its
// trigger. A popover left open behind the focus would cover the page for
// nobody.
test("closes when the Tab key leaves it", async () => {
  const screen = await render(<Page />);
  screen.getByRole("button", { name: "Example settings" }).element().focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("button", { name: "First control" }))
    .toHaveFocus();

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Done" }))
    .toHaveFocus();
  expect(screen.getByRole("dialog").elements()).toHaveLength(1);
  await userEvent.tab();

  await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  await expect
    .element(screen.getByRole("button", { name: "Next control" }))
    .toHaveFocus();
});

test("closes on a press outside", async () => {
  const screen = await render(<Page />);
  await screen.getByRole("button", { name: "Example settings" }).click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  // On the page itself, at a point where the popover is not.
  await userEvent.click(document.body, { position: { x: 1000, y: 600 } });

  await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
});

// The focus is on a button inside, where a letter is no text. Without the
// rule a "t" typed there would switch the theme of the page behind.
test("rests the shortcuts of the page while it is open, and runs its own", async () => {
  const log: Log = [];
  const screen = await renderWithShortcuts(
    <Registers shortcuts={[logging(log, "t", "page")]}>
      <Page>
        <Registers shortcuts={[logging(log, "y", "popover")]} />
      </Page>
    </Registers>,
  );
  await screen.getByRole("button", { name: "Example settings" }).click();
  await expect
    .element(screen.getByRole("button", { name: "First control" }))
    .toHaveFocus();

  await userEvent.keyboard("ty");
  expect(log).toEqual(["popover"]);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  await userEvent.keyboard("ty");
  expect(log).toEqual(["popover", "page"]);
});

test("says on its trigger whether it is open", async () => {
  const screen = await render(<Page />);
  const trigger = screen.getByRole("button", { name: "Example settings" });
  await expect.element(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  await expect
    .element(trigger)
    .toHaveAttribute("aria-controls", screen.getByRole("dialog").element().id);

  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
});

// A caller that keeps the state itself decides: the popover asks, and
// shows what it is told.
test("asks a caller that keeps its state, and shows what the caller says", async () => {
  const asked: boolean[] = [];
  function Kept({ obeys }: { obeys: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <Page
        open={open}
        onOpenChange={(next) => {
          asked.push(next);
          if (obeys) {
            setOpen(next);
          }
        }}
      />
    );
  }
  const screen = await render(<Kept obeys={false} />);
  const trigger = screen.getByRole("button", { name: "Example settings" });

  await trigger.click();
  await settled();
  expect(asked).toEqual([true]);
  expect(screen.getByRole("dialog").elements()).toEqual([]);

  await screen.rerender(<Kept obeys />);
  await trigger.click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  expect(asked).toEqual([true, true]);
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

// A popover that opens from the page lies in the page's place for popups,
// which is inside a landmark, fixed to the window so that nothing clips
// it. What opens from inside the popover belongs to the popover.
test("opens in the place the page has for popups, and keeps what opens from inside it", async () => {
  const screen = await render(
    <WithPlace>
      <Page>
        <div className="px-3.5 pb-3">
          <IconButton icon="check" label="Apply example" />
        </div>
      </Page>
    </WithPlace>,
  );
  const place = screen.getByTestId("place").element();
  screen.getByRole("button", { name: "Example settings" }).element().focus();
  await userEvent.keyboard("{Enter}");
  const popover = screen.getByRole("dialog", { name: "Example settings" });
  await expect.element(popover).toBeVisible();
  expect(place.contains(popover.element())).toBe(true);
  expect(
    getComputedStyle(popover.element().parentElement ?? popover.element())
      .position,
  ).toBe("fixed");

  // First control, Done, and then the button with the tooltip.
  await userEvent.tab();
  await userEvent.tab();
  await expect
    .element(popover.getByRole("button", { name: "Apply example" }))
    .toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Apply example"]);
  const [tooltip] = shownTooltipElements();
  const portal = popover.element().closest("[data-base-ui-portal]");
  expect(portal?.contains(tooltip ?? null)).toBe(true);
  // Escape puts the tooltip away first, and the popover stays.
  await userEvent.keyboard("{Escape}");
  await expect.poll(shownTooltips).toEqual([]);
  await expect.element(popover).toBeVisible();
});
