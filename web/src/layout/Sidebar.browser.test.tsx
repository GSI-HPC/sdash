// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { groups, views } from "../routing/views";
import { renderApp, resetPage, sidebarWidth } from "../testing/app";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { storageKey } from "./sidebar";

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

// The sidebar's key as the keyboard of the tests wants it written: a
// single "[" opens the name of a key there, two type the character.
const sidebarKey = "[[";

describe("the sidebar", () => {
  test("collapses to a rail of icons whose links keep their names", async () => {
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();

    await screen.getByRole("button", { name: "Collapse sidebar" }).click();

    await expect
      .element(screen.getByRole("button", { name: "Expand sidebar" }))
      .toBeVisible();
    await expect.poll(sidebarWidth).toBe(60);
    // The names are still there for assistive technology, and the groups
    // still name their lists.
    for (const view of views) {
      await expect
        .element(
          screen
            .getByRole("list", { name: view.group })
            .getByRole("link", { name: view.title, exact: true }),
        )
        .toBeInTheDocument();
    }

    await screen.getByRole("button", { name: "Expand sidebar" }).click();
    await expect.poll(sidebarWidth).toBe(224);
    await expect
      .element(screen.getByRole("button", { name: "Collapse sidebar" }))
      .toBeVisible();
  });

  // A screen reader says the name of a list on entering it: "Cluster,
  // list, four items". The label that gives the name stands right before
  // the list, and read as a text of its own as well it would be said
  // twice. So it names the list and is otherwise hidden from assistive
  // technology, in the full sidebar, where it is seen, and in the rail,
  // where it is not.
  test.each(["expanded", "collapsed"] as const)(
    "names each list by the label of its group, which is not read a second time, when %s",
    async (form) => {
      localStorage.setItem(storageKey, form);
      const screen = await renderApp("/overview");
      await expect
        .element(screen.getByRole("heading", { level: 1 }))
        .toBeVisible();

      for (const group of groups) {
        const list = screen.getByRole("list", { name: group, exact: true });
        await expect.element(list).toBeInTheDocument();
        const label = document.getElementById(
          list.element().getAttribute("aria-labelledby") ?? "",
        );
        expect(label?.textContent, group).toBe(group);
        expect(label?.getAttribute("aria-hidden"), group).toBe("true");
        if (form === "expanded") {
          await expect.element(label).toBeVisible();
        } else {
          await expect.element(label).not.toBeVisible();
        }
      }
    },
  );

  // A choice that held only until the next reload would have to be made
  // again on every start of sdash.
  test("is remembered collapsed for the next visit", async () => {
    const first = await renderApp("/overview");
    await first.getByRole("button", { name: "Collapse sidebar" }).click();
    expect(localStorage.getItem(storageKey)).toBe("collapsed");
    await first.unmount();

    const second = await renderApp("/overview");

    await expect
      .element(second.getByRole("button", { name: "Expand sidebar" }))
      .toBeVisible();
    expect(sidebarWidth()).toBe(60);

    await second.getByRole("button", { name: "Expand sidebar" }).click();
    expect(localStorage.getItem(storageKey)).toBe("expanded");
  });

  // The store is shared with whatever else runs on the origin and
  // outlives a version of sdash.
  test("starts expanded when the stored choice is not one", async () => {
    localStorage.setItem(storageKey, "wide");

    const screen = await renderApp("/overview");

    await expect
      .element(screen.getByRole("button", { name: "Collapse sidebar" }))
      .toBeVisible();
  });

  test("is collapsed and expanded by its key", async () => {
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();

    await userEvent.keyboard(sidebarKey);
    await expect
      .element(screen.getByRole("button", { name: "Expand sidebar" }))
      .toBeVisible();

    await userEvent.keyboard(sidebarKey);
    await expect
      .element(screen.getByRole("button", { name: "Collapse sidebar" }))
      .toBeVisible();
  });

  // In the rail a sighted keyboard user sees an icon and nothing else. The
  // name shows beside it while the link has the focus, stays while it
  // does, and goes away on Escape, as WCAG 2.1 asks of content that
  // appears on focus (success criterion 1.4.13).
  test("shows the name of a rail item beside it on focus, until Escape", async () => {
    localStorage.setItem(storageKey, "collapsed");
    const screen = await renderApp("/overview");
    const nodes = screen.getByRole("link", { name: "Nodes" });

    screen.getByRole("link", { name: "Overview" }).element().focus();
    await userEvent.tab();
    await expect.element(nodes).toHaveFocus();

    await expect.poll(shownTooltips).toEqual(["Nodes"]);
    // The name lies beside its link and reaches over the edge of the rail,
    // where the sidebar would clip anything laid out inside it: all of it
    // is there to see.
    const [name = null] = shownTooltipElements();
    const box = name?.getBoundingClientRect();
    expect(box?.left).toBeGreaterThanOrEqual(
      nodes.element().getBoundingClientRect().right,
    );
    expect(box?.right).toBeGreaterThan(60);
    await expect.element(name).toBeInViewport({ ratio: 1 });
    for (const x of [(box?.left ?? NaN) + 1, (box?.right ?? NaN) - 1]) {
      const middle = ((box?.top ?? NaN) + (box?.bottom ?? NaN)) / 2;
      expect(name?.contains(document.elementFromPoint(x, middle))).toBe(true);
    }
    // It repeats the name the link has, so assistive technology skips it.
    expect(name?.closest("[aria-hidden='true']")).not.toBeNull();
    await expect.element(nodes).toHaveAccessibleName("Nodes");

    await userEvent.keyboard("{Escape}");
    await expect.poll(shownTooltips).toEqual([]);
    await expect.element(nodes).toHaveFocus();
  });

  test("shows the name of a rail item under the pointer", async () => {
    localStorage.setItem(storageKey, "collapsed");
    const screen = await renderApp("/overview");
    const jobs = screen.getByRole("link", { name: "Jobs", exact: true });
    // From somewhere else, wherever the test before left the pointer.
    await screen.getByRole("main").hover();
    await expect.poll(shownTooltips).toEqual([]);

    await jobs.hover();

    await expect.poll(shownTooltips).toEqual(["Jobs"]);
  });
});

describe("on a narrow screen", () => {
  // Down to 360 px, a small phone held upright: the full sidebar would
  // leave the content a third of the screen.
  test("the sidebar is the rail, with nothing to expand it", async () => {
    await page.viewport(360, 740);
    const screen = await renderApp("/overview");

    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    expect(sidebarWidth()).toBe(60);
    expect(
      screen.getByRole("button", { name: /sidebar/ }).elements(),
    ).toHaveLength(0);

    // The key does nothing either, and leaves the choice for a wide
    // window as it was.
    await userEvent.keyboard(sidebarKey);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  // 360 px is the narrowest screen the layout is drawn for, and 320 px the
  // width WCAG 2.1 measures reflow at (success criterion 1.4.10): a page
  // enlarged to four times its size in a window 1280 px wide.
  test.each([360, 320])(
    "nothing reaches beyond the edge of a screen %d px wide",
    async (width) => {
      await page.viewport(width, 740);
      const screen = await renderApp("/overview");
      await expect.element(screen.getByText("v1.4.0")).toBeVisible();

      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      // The shell clips what is too wide for it, and the main region
      // scrolls: content that is too wide shows as a region that scrolls
      // sideways, not as a page that does.
      const main = screen.getByRole("main").element();
      expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
      for (const control of screen
        .getByRole("banner")
        .getByRole("button")
        .elements()) {
        const box = control.getBoundingClientRect();
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
    },
  );

  // The reason below the cluster switcher is all a sighted user learns
  // about the button. It starts at the button and would run off the right
  // edge of a narrow screen.
  test.each([360, 320])(
    "the reason below the cluster switcher is on a screen %d px wide in full",
    async (width) => {
      await page.viewport(width, 740);
      const screen = await renderApp("/overview");
      const switcher = screen.getByRole("button", { name: "Clusters" });

      switcher.element().focus();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
      await expect.element(switcher).toHaveFocus();
      const reason = screen.getByRole("tooltip");
      await expect.element(reason).toBeVisible();

      const box = () => reason.element().getBoundingClientRect();
      await expect.poll(() => box().right).toBeLessThanOrEqual(width);
      expect(box().left).toBeGreaterThanOrEqual(0);
      // Still below its button.
      expect(box().top).toBeGreaterThanOrEqual(
        switcher.element().getBoundingClientRect().bottom,
      );
    },
  );

  // At 320 px the header has no room for the name beside the mark. The
  // mark is hidden from assistive technology, so the name has to stay for
  // it: out of sight, and not out of the page.
  test("the name of the application is seen at 360 px and kept for assistive technology at 320 px", async () => {
    await page.viewport(360, 740);
    const screen = await renderApp("/overview");
    const name = screen.getByRole("banner").getByText("sdash", { exact: true });
    await expect.element(name).toBeVisible();
    expect(name.element().getBoundingClientRect().width).toBeGreaterThan(30);

    await page.viewport(320, 740);

    await expect
      .poll(() => name.element().getBoundingClientRect().width)
      .toBeLessThanOrEqual(1);
    await expect.element(name).toBeInTheDocument();
    expect(name.element().closest("[aria-hidden], [hidden]")).toBeNull();
  });

  // The button shrinks to its icon and keeps the name a screen reader and
  // a voice command use.
  test("the search button keeps its name", async () => {
    await page.viewport(360, 740);
    const screen = await renderApp("/overview");

    await expect
      .element(screen.getByRole("button", { name: "Search views and actions" }))
      .toBeVisible();
  });
});
