// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { pressModK, renderApp, resetPage } from "../testing/app";

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

type Screen = Awaited<ReturnType<typeof renderApp>>;

/**
 * Goes back or forward in the history as the browser's own buttons do:
 * without a press of the pointer on the page, which a dialog would take
 * for a press outside it and close on.
 */
function travel(direction: "back" | "forward"): void {
  // Found by its text: behind a dialog the button is hidden from
  // assistive technology, and so from a search by role.
  const button = [...document.querySelectorAll("button")].find(
    (each) => each.textContent === `Test: ${direction}`,
  );
  if (!button) {
    throw new Error(`the page has no button to go ${direction}`);
  }
  button.click();
}

/** The application at /nodes, gone on to /jobs, with the focus on a link. */
async function onJobsAfterNodes(): Promise<Screen> {
  const screen = await renderApp("/nodes");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toBeVisible();
  await screen.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Jobs" }))
    .toHaveFocus();
  screen.getByRole("link", { name: "Reservations" }).element().focus();
  return screen;
}

// A mouse has a button for Back, a trackpad a swipe and the keyboard
// Alt and the left arrow: none of them can a dialog keep to itself. The
// view behind the dialog changes, and the focus goes to its heading,
// which lies behind the dialog and is hidden from a screen reader for as
// long as the dialog is open. So the dialog goes with the view it was
// opened over.
describe("going back in the history while a dialog is open", () => {
  test("closes the command palette and puts the focus on the heading of the view", async () => {
    const screen = await onJobsAfterNodes();
    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();

    travel("back");

    // On the heading, and not on the link the dialog would have given the
    // focus back to.
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
    await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
    // Nothing of the page is left hidden from assistive technology.
    await expect
      .poll(() => document.activeElement?.closest('[aria-hidden="true"]'))
      .toBeNull();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
  });

  test("closes the keyboard help", async () => {
    const screen = await onJobsAfterNodes();
    await userEvent.keyboard("?");
    await expect
      .element(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
      .toBeVisible();

    travel("back");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
    await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  });

  // Closed, and not only out of sight until its address shows again.
  test("does not bring the dialog back with the view it was opened over", async () => {
    const screen = await onJobsAfterNodes();
    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    travel("back");
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();

    travel("forward");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Jobs" }))
      .toHaveFocus();
    expect(screen.getByRole("dialog").elements()).toEqual([]);
    // And the keys of the page work: no dialog is thought to be open.
    await userEvent.keyboard("gn");
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
  });
});

// "g" and "j" on the Jobs view, or Jobs chosen in the palette there, goes
// nowhere. An entry in the history for each would make Back seem to do
// nothing, once for every time.
describe("going to the view that shows already", () => {
  test("by its keys or through the palette adds nothing to the history", async () => {
    const screen = await renderApp("/nodes");
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toBeVisible();
    await screen.getByRole("link", { name: "Jobs", exact: true }).click();
    const jobs = screen.getByRole("heading", { level: 1, name: "Jobs" });
    await expect.element(jobs).toHaveFocus();

    await userEvent.keyboard("gj");
    await userEvent.keyboard("gj");
    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("jobs{Enter}");
    await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
    await expect.element(jobs).toBeVisible();

    await screen.getByRole("button", { name: "Test: back" }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
  });
});
