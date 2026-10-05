// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useRef } from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { settled } from "../testing/app";
import { askForLessMotion } from "../testing/system";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { Button } from "./Button";
import { Dialog, DialogTitle } from "./Dialog";
import {
  type ToastOptions,
  ToastProvider,
  ToastRegion,
  useToast,
} from "./Toast";

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  await page.viewport(1280, 720);
});

/** What the toast of most tests says. */
const saved: ToastOptions = {
  title: "Changes saved",
  detail: "POST /example 200",
};

/** A failure, which stays until it is dismissed. */
const failed: ToastOptions = {
  title: "Changes not saved",
  detail: "POST /example 500",
  tone: "err",
};

/**
 * A button that shows the given toasts when it is pressed, and one that
 * takes the last one shown away again.
 */
function Buttons({ toasts }: { toasts: readonly ToastOptions[] }) {
  const toast = useToast();
  const last = useRef<string | null>(null);
  return (
    <>
      <Button
        onClick={() => {
          for (const options of toasts) {
            last.current = toast.show(options);
          }
        }}
      >
        Save changes
      </Button>
      <Button
        onClick={() => {
          if (last.current !== null) {
            toast.dismiss(last.current);
          }
        }}
      >
        Take it back
      </Button>
      <p>Somewhere else</p>
    </>
  );
}

/**
 * Renders the page with the toasts and their region. A toast stays for
 * `timeout` milliseconds: the application's five seconds would have every
 * test wait that long.
 */
function renderPage(toasts: readonly ToastOptions[], timeout = 5000) {
  return render(
    <ToastProvider timeout={timeout}>
      <Buttons toasts={toasts} />
      <ToastRegion />
    </ToastProvider>,
  );
}

/** Presses the button by the keyboard, so that the pointer stays away. */
async function save(screen: Awaited<ReturnType<typeof renderPage>>) {
  await screen.getByText("Somewhere else").hover();
  const button = screen.getByRole("button", { name: "Save changes" });
  button.element().focus();
  await userEvent.keyboard("{Enter}");
  return button;
}

/** The titles of the toasts that can be seen, the newest first. */
function shownToasts(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[role='dialog']")]
    .filter((toast) => toast.checkVisibility())
    .map(
      (toast) =>
        document.getElementById(toast.getAttribute("aria-labelledby") ?? "")
          ?.textContent ?? "",
    );
}

/** Waits for the given time, which a test of what stays has to let pass. */
function pass(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// A toast reports. It must not take the focus from what the user is
// doing, and a screen reader has to find its two texts as one message.
test("shows a toast with its title and its detail, and leaves the focus where it was", async () => {
  const screen = await renderPage([saved]);

  const button = await save(screen);

  const toast = screen.getByRole("dialog", { name: "Changes saved" });
  await expect.element(toast).toBeVisible();
  await expect.element(toast).toHaveAccessibleDescription("POST /example 200");
  await expect.element(toast.getByText("POST /example 200")).toBeVisible();
  // Not modal: the page stays in reach.
  await expect.element(toast).toHaveAttribute("aria-modal", "false");
  await expect.element(button).toHaveFocus();
  // At the bottom right of the window.
  const box = toast.element().getBoundingClientRect();
  expect(1280 - box.right).toBe(18);
  expect(720 - box.bottom).toBe(18);
});

// WCAG 2.1, success criterion 4.1.3: a status message reaches assistive
// technology without taking the focus. The region is there before the
// first toast is, or its first content would not be announced.
test("is in a region named Notifications that announces politely", async () => {
  const screen = await renderPage([saved]);
  const region = screen.getByRole("region", { name: "Notifications" });
  await expect.element(region).toBeInTheDocument();
  await expect.element(region).toHaveAttribute("aria-live", "polite");
  expect(region.getByRole("dialog").elements()).toEqual([]);

  await save(screen);

  await expect
    .element(region.getByRole("dialog", { name: "Changes saved" }))
    .toBeVisible();
});

test("goes by itself after its time", async () => {
  const screen = await renderPage([saved], 300);

  await save(screen);
  await expect.poll(shownToasts).toEqual(["Changes saved"]);

  await expect.poll(shownToasts, { timeout: 3000 }).toEqual([]);
});

// WCAG 2.1, success criterion 2.2.1: a time limit can be stopped. A user
// who needs longer to read rests the pointer on the toast.
test("stays while the pointer is over it", async () => {
  const screen = await renderPage([saved], 800);
  await save(screen);
  const toast = screen.getByRole("dialog", { name: "Changes saved" });

  await toast.hover();
  await pass(1600);
  expect(shownToasts()).toEqual(["Changes saved"]);

  await screen.getByText("Somewhere else").hover();
  await expect.poll(shownToasts, { timeout: 3000 }).toEqual([]);
});

test("stays while the focus is inside the region", async () => {
  const screen = await renderPage([saved], 800);
  const button = await save(screen);
  await expect.poll(shownToasts).toEqual(["Changes saved"]);

  await userEvent.keyboard("{F6}");
  await expect
    .element(screen.getByRole("region", { name: "Notifications" }))
    .toHaveFocus();
  await pass(1600);
  expect(shownToasts()).toEqual(["Changes saved"]);

  // Back out of the region, and the time runs on.
  await userEvent.tab({ shift: true });
  await expect.element(button).toHaveFocus();
  await expect.poll(shownToasts, { timeout: 3000 }).toEqual([]);
});

// What went wrong must not be missed by someone who looked away.
test("never goes by itself when it reports a failure", async () => {
  const screen = await renderPage([saved, failed], 300);

  await save(screen);
  await expect
    .poll(shownToasts)
    .toEqual(["Changes not saved", "Changes saved"]);

  // The premise: the time of the other toast has passed.
  await expect
    .poll(shownToasts, { timeout: 3000 })
    .toEqual(["Changes not saved"]);
  await pass(600);
  expect(shownToasts()).toEqual(["Changes not saved"]);
});

test("is reached with F6 and Tab and dismissed with Escape, and the focus goes back", async () => {
  const screen = await renderPage([failed]);
  const button = await save(screen);
  const toast = screen.getByRole("dialog", { name: "Changes not saved" });
  await expect.element(toast).toBeVisible();

  await userEvent.keyboard("{F6}");
  const region = screen.getByRole("region", { name: "Notifications" });
  await expect.element(region).toHaveFocus();
  // The ring of the region is inside it.
  expect(getComputedStyle(region.element()).outlineOffset).toBe("-2px");
  await userEvent.tab();
  await expect.element(toast).toHaveFocus();
  // So is the ring of a toast: where the region scrolls, a toast lies at
  // its edge, and the region cuts off what reaches beyond the toast.
  const ring = getComputedStyle(toast.element());
  expect(ring.outlineStyle).toBe("solid");
  expect(ring.outlineWidth).toBe("2px");
  expect(ring.outlineOffset).toBe("-2px");
  await userEvent.tab();
  await expect
    .element(toast.getByRole("button", { name: "Dismiss" }))
    .toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(toast).toHaveFocus();

  await userEvent.keyboard("{Escape}");

  await expect.poll(shownToasts).toEqual([]);
  await expect.element(button).toHaveFocus();
});

test("is dismissed by its button", async () => {
  const screen = await renderPage([failed]);
  await save(screen);
  const toast = screen.getByRole("dialog", { name: "Changes not saved" });

  await toast.getByRole("button", { name: "Dismiss" }).click();

  await expect.poll(shownToasts).toEqual([]);
});

test("is taken away by the component that showed it", async () => {
  const screen = await renderPage([failed]);
  await save(screen);
  await expect.poll(shownToasts).toEqual(["Changes not saved"]);

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  await expect.poll(shownToasts).toEqual([]);
});

// More would cover the corner of the view. The oldest wait out of sight.
test("shows no more than five at once", async () => {
  const seven = Array.from({ length: 7 }, (_, index) => ({
    title: `Message ${String(index + 1)}`,
    tone: "err" as const,
  }));
  const screen = await renderPage(seven);

  await save(screen);

  await expect
    .poll(shownToasts)
    .toEqual(["Message 7", "Message 6", "Message 5", "Message 4", "Message 3"]);
  // In a column, the newest at its top and each older one below the one
  // before it, so that a toast that arrives moves none that is there.
  const boxes = screen
    .getByRole("dialog")
    .elements()
    .filter((toast) => toast.checkVisibility())
    .map((toast) => toast.getBoundingClientRect());
  expect(boxes).toHaveLength(5);
  for (const [index, box] of boxes.entries()) {
    const older = boxes[index + 1];
    if (older) {
      expect(older.top - box.top).toBeGreaterThanOrEqual(box.height);
    }
  }

  // One that is dismissed makes room for one that waited.
  await screen
    .getByRole("dialog", { name: "Message 7" })
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect
    .poll(shownToasts)
    .toEqual(["Message 6", "Message 5", "Message 4", "Message 3", "Message 2"]);
});

// Only a toast that stays waits. The time of one that goes by itself runs
// on while five newer ones cover it: it is gone when its time is up, and
// does not show again when there is room.
test("does not keep a toast with a time back until there is room for it", async () => {
  const failures = Array.from({ length: 5 }, (_, index) => ({
    title: `Failure ${String(index + 1)}`,
    tone: "err" as const,
  }));
  const screen = await renderPage([saved, ...failures], 500);

  await save(screen);

  const all = () => document.querySelectorAll("[role='dialog']").length;
  // The premise: it is on the page, out of sight.
  expect(all()).toBe(6);
  await expect.poll(() => shownToasts().length).toBe(5);
  expect(shownToasts()).not.toContain("Changes saved");
  await expect.poll(all, { timeout: 3000 }).toBe(5);

  await screen
    .getByRole("dialog", { name: "Failure 5" })
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect
    .poll(shownToasts)
    .toEqual(["Failure 4", "Failure 3", "Failure 2", "Failure 1"]);
});

// A toast comes and goes. As a heading it would come and go in the
// outline of the page a screen reader user moves by.
test("is no heading", async () => {
  const screen = await renderPage([saved, failed]);

  await save(screen);

  await expect.poll(() => shownToasts().length).toBe(2);
  expect(screen.getByRole("heading").elements()).toEqual([]);
});

// The dot is the colour of the tone, and the title says the same in
// words: the dot is not read.
test("marks its tone with a dot that assistive technology skips", async () => {
  const screen = await renderPage([saved, failed]);
  await save(screen);
  await expect.poll(() => shownToasts().length).toBe(2);
  const dotOf = (name: string) =>
    screen.getByRole("dialog", { name }).element().firstElementChild;
  const colourOf = (className: string) => {
    const probe = document.createElement("span");
    probe.className = className;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  };

  for (const [name, tone] of [
    ["Changes saved", "bg-ok-fg"],
    ["Changes not saved", "bg-err-fg"],
  ] as const) {
    const dot = dotOf(name);
    expect(dot?.getAttribute("aria-hidden"), name).toBe("true");
    expect(dot ? getComputedStyle(dot).backgroundColor : "", name).toBe(
      colourOf(tone),
    );
  }
});

test("fits a screen 320 px wide", async () => {
  await page.viewport(320, 600);
  const screen = await renderPage([
    {
      title: "Changes not saved",
      detail: "POST /example/with/a/long/path/that/does/not/fit/on/a/line 500",
      tone: "err",
    },
  ]);

  await save(screen);

  const toast = screen.getByRole("dialog", { name: "Changes not saved" });
  await expect.element(toast).toBeVisible();
  await settled();
  const box = toast.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(320);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  await expect
    .element(toast.getByRole("button", { name: "Dismiss" }))
    .toBeInViewport({ ratio: 1 });
});

/**
 * How far the shadows of an element reach beyond its box on each side, in
 * px: as far as a shadow is blurred and spread, more where it is moved to
 * and less where it is moved from.
 */
function shadowReach(element: Element) {
  // The browser reports each shadow as its colour, the two lengths it is
  // moved by, its blur and its spread. Tailwind sets several, of which all
  // but the one of the token are empty.
  const shadows = getComputedStyle(element).boxShadow.matchAll(
    /(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (-?[\d.]+)px/g,
  );
  const reach = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const shadow of shadows) {
    const [across = 0, down = 0, blur = 0, spread = 0] = shadow
      .slice(1)
      .map(Number);
    reach.left = Math.max(reach.left, blur + spread - across);
    reach.top = Math.max(reach.top, blur + spread - down);
    reach.right = Math.max(reach.right, blur + spread + across);
    reach.bottom = Math.max(reach.bottom, blur + spread + down);
  }
  return reach;
}

// The region scrolls, and what scrolls cuts off whatever reaches beyond
// it, in a straight line: the shadow of every toast ended at the right
// edge of the column and right below the last toast. The region now has
// the room the shadow takes, or ends where the window does, which cuts a
// shadow off as it cuts off everything. The toasts are where they were.
test.each([
  { theme: "light", width: 1280 },
  { theme: "dark", width: 1280 },
  { theme: "light", width: 360 },
  { theme: "dark", width: 360 },
] as const)(
  "cuts nothing off the shadow of a toast that the window does not, in the $theme theme on a screen $width px wide",
  async ({ theme, width }) => {
    document.documentElement.dataset.theme = theme;
    await page.viewport(width, 720);
    // The older one as narrow as a toast is, the newer as wide as one may
    // be.
    const screen = await renderPage([
      { title: "Changes saved", tone: "err" },
      {
        title: "Changes not saved",
        detail: `POST ${"/example".repeat(12)} 500`,
        tone: "err",
      },
    ]);
    await save(screen);
    await expect.poll(() => shownToasts().length).toBe(2);
    await settled();

    const region = screen
      .getByRole("region", { name: "Notifications" })
      .element()
      .getBoundingClientRect();
    const toasts = screen.getByRole("dialog").elements();
    const [wide, narrow] = toasts.map((toast) => toast.getBoundingClientRect());
    // Where the handoff has them: 18 px from the right and the bottom of
    // the window, no wider than 400 px, and 18 px from the left on a
    // screen that has no room for that.
    expect(wide?.width).toBe(Math.min(400, width - 36));
    expect(wide?.right).toBe(width - 18);
    expect(narrow?.right).toBe(width - 18);
    expect(narrow?.bottom).toBe(720 - 18);

    for (const toast of toasts) {
      const box = toast.getBoundingClientRect();
      const reach = shadowReach(toast);
      // The premise: a toast has a shadow, which reaches to every side.
      expect(Math.min(...Object.values(reach))).toBeGreaterThan(0);
      const room = {
        left: region.left <= 0 ? Infinity : box.left - region.left,
        top: region.top <= 0 ? Infinity : box.top - region.top,
        right: region.right >= width ? Infinity : region.right - box.right,
        bottom: region.bottom >= 720 ? Infinity : region.bottom - box.bottom,
      };
      for (const side of ["left", "top", "right", "bottom"] as const) {
        expect(room[side], side).toBeGreaterThanOrEqual(reach[side]);
      }
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  },
);

// The room the region keeps for the shadows lies over the page, and the
// region is on the page while it is empty too. That room is the page's: a
// control of the page under it has to answer the pointer, beside a toast
// and where no toast is.
test("lets a press beside its toasts through to the page", async () => {
  let pressed = 0;
  const screen = await render(
    <ToastProvider>
      <Buttons toasts={[failed]} />
      <button
        type="button"
        className="fixed right-80 bottom-6"
        onClick={() => {
          pressed += 1;
        }}
      >
        Under the region
      </button>
      <ToastRegion />
    </ToastProvider>,
  );
  const box = screen
    .getByRole("button", { name: "Under the region" })
    .element()
    .getBoundingClientRect();
  const position = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
  };
  const region = screen.getByRole("region", { name: "Notifications" });
  const holds = (element: Element) => {
    const around = element.getBoundingClientRect();
    return (
      around.left <= position.x &&
      position.x <= around.right &&
      around.top <= position.y &&
      position.y <= around.bottom
    );
  };
  // The premise: the button lies under the region, empty as it is.
  expect(holds(region.element())).toBe(true);

  await userEvent.click(document.body, { position });
  expect(pressed).toBe(1);

  await save(screen);
  const toast = region.getByRole("dialog", { name: "Changes not saved" });
  await expect.element(toast).toBeVisible();
  // The premise: it still does, beside the toast.
  expect(holds(region.element())).toBe(true);
  expect(holds(toast.element())).toBe(false);

  await userEvent.click(document.body, { position });
  expect(pressed).toBe(2);
});

// An id, a path or the name of a host is one word, and a title of one long
// word has to break where the toast ends: it ran on under the button and
// out of the window.
test("breaks a title that is one long word", async () => {
  const word = "example".repeat(14);
  const screen = await renderPage([{ title: word, tone: "err" }]);

  await save(screen);

  const toast = screen.getByRole("dialog", { name: word });
  await expect.element(toast).toBeVisible();
  await settled();
  const box = toast.element().getBoundingClientRect();
  const title = toast.getByText(word).element().getBoundingClientRect();
  const dismiss = toast
    .getByRole("button", { name: "Dismiss" })
    .element()
    .getBoundingClientRect();
  expect(box.width).toBeLessThanOrEqual(400);
  expect(title.right).toBeLessThanOrEqual(dismiss.left);
  // The premise: it took more than one line.
  expect(title.height).toBeGreaterThan(30);
});

// In a low window, which is what an enlarged page is, five toasts are
// higher than the window. The region is fixed to the window, so nothing
// scrolls the page to a toast above its edge: the region scrolls, and the
// focus brings a toast into it (WCAG 2.1, success criterion 1.4.10).
test("scrolls inside its region where the toasts are higher than the window", async () => {
  await page.viewport(640, 256);
  const toasts = Array.from({ length: 5 }, (_, index): ToastOptions => ({
    title: `Message ${String(index + 1)}`,
    detail: "POST /example 500",
    tone: "err",
  }));
  const screen = await renderPage(toasts);
  await save(screen);
  await expect.poll(() => shownToasts().length).toBe(5);
  const region = screen.getByRole("region", { name: "Notifications" });
  const inWindow = (toast: Element) => {
    const box = toast.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  };

  const box = region.element().getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
  // The premise: they do not all fit.
  expect(region.element().scrollHeight).toBeGreaterThan(
    region.element().clientHeight,
  );

  await userEvent.keyboard("{F6}");
  await expect.element(region).toHaveFocus();
  for (const { title } of toasts) {
    const toast = screen.getByRole("dialog", { name: title });
    toast.element().focus();
    await expect
      .poll(() => inWindow(toast.element()), { message: title })
      .toBe(true);
  }
});

// A browser scrolls to what takes the focus: Chromium and Safari whenever
// a part of it is out of sight, Firefox only when none of it is in sight,
// which leaves a toast that lies across the edge of the window where it
// is, cut off. Chromium runs this test, so the focus is given without a
// scroll, which is what Firefox makes of it there.
test("brings a toast that takes the focus half out of sight into sight in full, for its button too", async () => {
  await page.viewport(640, 256);
  const toasts = Array.from({ length: 5 }, (_, index): ToastOptions => ({
    title: `Message ${String(index + 1)}`,
    detail: "POST /example 500",
    tone: "err",
  }));
  const screen = await renderPage(toasts);
  await save(screen);
  await expect.poll(() => shownToasts().length).toBe(5);
  const region = screen.getByRole("region", { name: "Notifications" });
  await userEvent.keyboard("{F6}");
  await expect.element(region).toHaveFocus();
  /** The toast that lies across the lower edge of the window. */
  const across = () => {
    region.element().scrollTop = 0;
    const toast = [
      ...region.element().querySelectorAll<HTMLElement>("[role='dialog']"),
    ].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > window.innerHeight;
    });
    if (!toast) {
      throw new Error("no toast lies across the edge of the window");
    }
    return toast;
  };

  const toast = across();
  // The premise: more than the part of a pixel is cut off.
  expect(toast.getBoundingClientRect().bottom).toBeGreaterThan(
    window.innerHeight + 4,
  );
  toast.focus({ preventScroll: true });

  expect(document.activeElement).toBe(toast);
  expect(toast.matches(":focus-visible")).toBe(true);
  // All of it, but for the part of a pixel a scroll position rounds away.
  expect(toast.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    window.innerHeight + 1,
  );

  // The same when its button takes the focus: the whole toast comes, which
  // is what the button dismisses, and not the button alone.
  expect(across()).toBe(toast);
  const dismiss = toast.querySelector("button");
  dismiss?.focus({ preventScroll: true });

  expect(document.activeElement).toBe(dismiss);
  expect(toast.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    window.innerHeight + 1,
  );
});

// The button shows an icon alone, and its name as a tooltip. The toasts
// lie over everything else on the page, the tooltips of the page included,
// and the tooltip of a toast's own button has to lie over the toast.
test("shows the name of its button over the toast and not under it", async () => {
  const screen = await renderPage([failed]);
  await save(screen);
  const toast = screen.getByRole("dialog", { name: "Changes not saved" });

  await toast.getByRole("button", { name: "Dismiss" }).hover();

  await expect.poll(shownTooltips).toEqual(["Dismiss"]);
  const [tooltip] = shownTooltipElements();
  const box = tooltip?.getBoundingClientRect();
  await expect.element(tooltip ?? null).toBeInViewport({ ratio: 1 });
  for (const x of [(box?.left ?? NaN) + 2, (box?.right ?? NaN) - 2]) {
    for (const y of [(box?.top ?? NaN) + 2, (box?.bottom ?? NaN) - 2]) {
      expect(tooltip?.contains(document.elementFromPoint(x, y))).toBe(true);
    }
  }
});

// A toast often reports what a dialog sent. It lies over the dialog and
// its scrim, is not hidden from assistive technology with the page, and a
// press on it is no press outside the dialog.
test("shows over an open dialog, and is dismissed there without closing the dialog", async () => {
  let closed = 0;
  function Sends() {
    const toast = useToast();
    return (
      <Dialog
        open
        onClose={() => {
          closed += 1;
        }}
        className="w-100"
      >
        <DialogTitle>Example dialog</DialogTitle>
        <Button
          onClick={() => {
            toast.show(failed);
          }}
        >
          Send
        </Button>
      </Dialog>
    );
  }
  const screen = await render(
    <ToastProvider>
      <Sends />
      <ToastRegion />
    </ToastProvider>,
  );
  await screen.getByRole("button", { name: "Send" }).click();
  const region = screen.getByRole("region", { name: "Notifications" });
  const toast = region.getByRole("dialog", { name: "Changes not saved" });
  await expect.element(toast).toBeVisible();
  expect(region.element().closest("[aria-hidden='true'], [inert]")).toBeNull();

  await toast.getByRole("button", { name: "Dismiss" }).click();

  await expect.poll(() => region.getByRole("dialog").elements()).toEqual([]);
  await settled();
  expect(closed).toBe(0);
  await expect
    .element(screen.getByRole("dialog", { name: "Example dialog" }))
    .toBeVisible();
});

// Escape with the focus in a toast is the toast's. The dialog beside it
// listens for the same key on the page: a form in it would be lost, and a
// confirmation cancelled, by a key that was meant for a message.
test("is dismissed by Escape beside an open dialog, which stays open", async () => {
  let closed = 0;
  function Sends() {
    const toast = useToast();
    return (
      <Dialog
        open
        onClose={() => {
          closed += 1;
        }}
        className="w-100"
      >
        <DialogTitle>Example dialog</DialogTitle>
        <Button
          onClick={() => {
            toast.show(failed);
          }}
        >
          Send
        </Button>
      </Dialog>
    );
  }
  const screen = await render(
    <ToastProvider>
      <Sends />
      <ToastRegion />
    </ToastProvider>,
  );
  const send = screen.getByRole("button", { name: "Send" });
  send.element().focus();
  await userEvent.keyboard("{Enter}");
  const region = screen.getByRole("region", { name: "Notifications" });
  const toast = region.getByRole("dialog", { name: "Changes not saved" });
  await expect.element(toast).toBeVisible();
  await userEvent.keyboard("{F6}");
  await expect.element(region).toHaveFocus();
  await userEvent.tab();
  await expect.element(toast).toHaveFocus();

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => region.getByRole("dialog").elements()).toEqual([]);
  await settled();
  expect(closed).toBe(0);
  await expect
    .element(screen.getByRole("dialog", { name: "Example dialog" }))
    .toBeVisible();
  // The focus is back in the dialog, and the next Escape is the dialog's.
  await expect.element(send).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(closed).toBe(1);
});

test("fades in and out, and not for a user who asked for less motion", async () => {
  const screen = await renderPage([failed]);
  await save(screen);
  const toast = screen.getByRole("dialog", { name: "Changes not saved" });
  await expect.element(toast).toBeVisible();
  const style = getComputedStyle(toast.element());
  expect(style.transitionProperty).toBe("opacity");
  expect(style.transitionDuration).toBe("0.15s");
  // On the one easing of the handoff, as everything that moves.
  expect(style.transitionTimingFunction).toBe("cubic-bezier(0.32, 0.72, 0, 1)");

  await askForLessMotion(true);
  try {
    // The premise: the page sees the setting.
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    expect(getComputedStyle(toast.element()).transitionProperty).toBe("none");
  } finally {
    await askForLessMotion(false);
  }
});
