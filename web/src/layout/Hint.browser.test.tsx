// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { renderApp, resetPage, settled } from "../testing/app";
import { storageKey } from "./sidebar";

// The hints of the shell as a user meets them (Hint.tsx): the names
// beside the items of the rail, and how a hint keeps to its owner. That
// the cluster switcher has its reason is in Shell.browser.test.tsx, and
// what a narrow screen does to it in Sidebar.browser.test.tsx.

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

// The sidebar's key as the keyboard of the tests wants it written: a
// single "[" opens the name of a key there, two type the character.
const sidebarKey = "[[";

/** The names the rail shows beside its items at this moment. */
function shownHints(): string[] {
  const hints = document.querySelectorAll<HTMLElement>(
    'nav :is(a, button) > span[aria-hidden="true"]',
  );
  return [...hints]
    .filter((hint) => !hint.hidden)
    .map((hint) => hint.innerText);
}

/**
 * Renders the application with the sidebar as the rail and the pointer
 * over the main region. The tests of a file share one page, and with it
 * the pointer, which the test before may have left on a rail item.
 */
async function renderRail() {
  localStorage.setItem(storageKey, "collapsed");
  const screen = await renderApp("/overview");
  await screen.getByRole("main").hover();
  await expect.poll(shownHints).toEqual([]);
  return screen;
}

/**
 * The part of the rail that scrolls: the links, which the button of the
 * sidebar collapses and expands and says so with aria-controls.
 */
function railLinks(): HTMLElement {
  const button = page.getByRole("button", { name: "Expand sidebar" });
  const links = document.getElementById(
    button.element().getAttribute("aria-controls") ?? "",
  );
  if (!links) {
    throw new Error("the button of the sidebar names nothing it controls");
  }
  return links;
}

/** How far the name beside a rail item is from level with its icon. */
function offLevel(item: Element): number {
  const label = item.querySelector('span[aria-hidden="true"] > span');
  const icon = item.querySelector("svg");
  if (!label || !icon) {
    return NaN;
  }
  const middle = (box: DOMRect) => box.top + box.height / 2;
  return Math.abs(
    middle(label.getBoundingClientRect()) -
      middle(icon.getBoundingClientRect()),
  );
}

// In the rail the name beside an icon is the only name a sighted user
// sees. One that stands beside the wrong icon, or beside none, is worse
// than no name.
describe("the name beside a rail item", () => {
  // The sidebar expands while a name shows. Its link then loses the focus
  // as a link of the full sidebar, which shows no names, and the name must
  // not be there again when the rail is.
  test("is not back with the rail after its link lost the focus in the full sidebar", async () => {
    const screen = await renderRail();
    screen.getByRole("link", { name: "Overview" }).element().focus();
    await userEvent.tab();
    await expect.poll(shownHints).toEqual(["Nodes"]);

    await userEvent.keyboard(sidebarKey);
    await expect
      .element(screen.getByRole("button", { name: "Collapse sidebar" }))
      .toBeVisible();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("link", { name: "Partitions" }))
      .toHaveFocus();
    await userEvent.keyboard(sidebarKey);

    await expect
      .element(screen.getByRole("button", { name: "Expand sidebar" }))
      .toBeVisible();
    expect(shownHints()).toEqual([]);
  });

  test("is not back with the rail after the pointer left its link in the full sidebar", async () => {
    const screen = await renderRail();
    await screen.getByRole("link", { name: "Jobs", exact: true }).hover();
    await expect.poll(shownHints).toEqual(["Jobs"]);

    await userEvent.keyboard(sidebarKey);
    await expect
      .element(screen.getByRole("button", { name: "Collapse sidebar" }))
      .toBeVisible();
    await screen.getByRole("main").hover();
    await userEvent.keyboard(sidebarKey);

    await expect
      .element(screen.getByRole("button", { name: "Expand sidebar" }))
      .toBeVisible();
    expect(shownHints()).toEqual([]);
  });

  test("is not back after the button that expands the sidebar was used", async () => {
    const screen = await renderRail();
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    await expand.hover();
    await expect.poll(shownHints).toEqual(["Expand sidebar"]);

    await expand.click();
    await screen.getByRole("main").hover();
    await userEvent.keyboard(sidebarKey);

    await expect.element(expand).toBeVisible();
    expect(shownHints()).toEqual([]);
  });

  // The focus stays on the link all the while, so no blur takes the name
  // down. When the rail is back, the place it remembered is no longer
  // where the link is.
  test("is not left where its link was before the sidebar expanded and its list scrolled", async () => {
    await page.viewport(1000, 420);
    const screen = await renderRail();
    const scroller = railLinks();
    screen.getByRole("link", { name: "Overview" }).element().focus();
    await userEvent.tab();
    await expect.poll(shownHints).toEqual(["Nodes"]);

    await userEvent.keyboard(sidebarKey);
    await expect
      .element(screen.getByRole("button", { name: "Collapse sidebar" }))
      .toBeVisible();
    scroller.scrollTop = 24;
    await expect.poll(() => scroller.scrollTop).toBe(24);
    await userEvent.keyboard(sidebarKey);

    await expect
      .element(screen.getByRole("button", { name: "Expand sidebar" }))
      .toBeVisible();
    expect(shownHints()).toEqual([]);
  });

  // In a window too low for the rail the Tab key scrolls the next link
  // into view as it gives it the focus, and the browser tells of the
  // scroll afterwards. The name has to be there then, beside the link.
  test("is beside a link the Tab key had to scroll to", async () => {
    await page.viewport(1000, 420);
    await renderRail();
    const scroller = railLinks();
    const links = [...scroller.querySelectorAll("a")];
    const bottom = scroller.getBoundingClientRect().bottom;
    const cut = links.findIndex(
      (link) => link.getBoundingClientRect().bottom > bottom,
    );
    // The premise: a link that is cut off, with one before it that is not.
    expect(cut).toBeGreaterThan(0);

    links[cut - 1]?.focus();
    await userEvent.tab();

    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
    const reached = links[cut];
    if (!reached) {
      throw new Error("the rail has no link that is cut off");
    }
    await expect
      .poll(shownHints)
      .toEqual([reached.querySelector("span")?.textContent]);
    await expect.poll(() => offLevel(reached)).toBeLessThanOrEqual(1);
  });

  test("moves with its link when the rail scrolls, and goes once the link is out of sight", async () => {
    await page.viewport(1000, 420);
    const screen = await renderRail();
    const scroller = railLinks();
    const nodes = screen.getByRole("link", { name: "Nodes" });
    screen.getByRole("link", { name: "Overview" }).element().focus();
    await userEvent.tab();
    await expect.poll(shownHints).toEqual(["Nodes"]);
    expect(offLevel(nodes.element())).toBeLessThanOrEqual(1);

    scroller.scrollTop = 24;
    await expect.poll(() => scroller.scrollTop).toBe(24);
    await expect.poll(() => offLevel(nodes.element())).toBeLessThanOrEqual(1);
    expect(shownHints()).toEqual(["Nodes"]);

    scroller.scrollTop = scroller.scrollHeight;
    await expect.poll(shownHints).toEqual([]);
    await expect.element(nodes).toHaveFocus();
  });

  // The main region scrolls without moving the rail.
  test("stays while another region scrolls", async () => {
    await page.viewport(1000, 220);
    const screen = await renderRail();
    await expect.element(screen.getByText("v1.4.0")).toBeVisible();
    await screen.getByRole("link", { name: "Overview" }).hover();
    await expect.poll(shownHints).toEqual(["Overview"]);

    const main = screen.getByRole("main").element();
    main.scrollTop = 40;
    await expect.poll(() => main.scrollTop).toBe(40);
    await settled();

    expect(shownHints()).toEqual(["Overview"]);
  });

  // Enlarging the page is a change of the window's size to the page. A
  // user who enlarges it to read a name must not lose the name by it.
  test("stays when the window changes size", async () => {
    const screen = await renderRail();
    const jobs = screen.getByRole("link", { name: "Jobs", exact: true });
    await jobs.hover();
    await expect.poll(shownHints).toEqual(["Jobs"]);

    await page.viewport(1100, 600);
    await settled();

    expect(shownHints()).toEqual(["Jobs"]);
    expect(offLevel(jobs.element())).toBeLessThanOrEqual(1);
  });
});

describe("the reason below the cluster switcher", () => {
  // Below 640 px the header is laid out anew and the button stands
  // further left. The reason has to stand below it there too.
  test("moves with its button when the window changes size", async () => {
    await page.viewport(900, 600);
    const screen = await renderApp("/overview");
    const switcher = screen.getByRole("button", { name: "Clusters" });
    const buttonLeft = () => switcher.element().getBoundingClientRect().left;
    switcher.element().focus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
    const reason = screen.getByRole("tooltip");
    await expect.element(reason).toBeVisible();
    const offset = () => {
      const label = reason.element().firstElementChild;
      return label
        ? Math.abs(label.getBoundingClientRect().left - buttonLeft())
        : NaN;
    };
    expect(offset()).toBeLessThanOrEqual(1);
    const before = buttonLeft();

    await page.viewport(600, 600);

    // The premise: the button did move.
    await expect.poll(buttonLeft).toBeLessThan(before - 8);
    await expect.poll(offset).toBeLessThanOrEqual(1);
    await expect.element(reason).toBeVisible();
    await expect.element(switcher).toHaveFocus();
  });
});
