// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { views } from "../routing/views";
import {
  focused,
  pressModK,
  renderApp,
  resetPage,
  settled,
  sidebarWidth,
} from "../testing/app";
import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { shellKeys } from "./keys";
import { Shell } from "./Shell";

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

describe("the layout", () => {
  // A screen reader user moves by landmarks: the header, the navigation
  // and the content have to be three of them, and the navigation has to
  // have a name, since a later view may bring one of its own.
  test("has a banner, a named navigation and a main region with the one heading", async () => {
    const screen = await renderApp("/overview");

    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect
      .element(screen.getByRole("navigation", { name: "Views" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("main").getByRole("heading", { level: 1 }))
      .toHaveTextContent("Overview");
    expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(
      1,
    );
  });

  // A screen reader lists the landmarks of a page, and each one in the
  // list has to be worth going to. The sidebar is the navigation: around
  // it there is no landmark of its own, which would have no name and hold
  // nothing but the navigation. The button that collapses the sidebar is
  // inside the navigation, since content in no landmark at all is passed
  // over by a user who moves from one landmark to the next.
  test("has these three landmarks and no other", async () => {
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    const count = (role: "banner" | "navigation" | "main" | "complementary") =>
      screen.getByRole(role).elements().length;

    expect(count("banner")).toBe(1);
    expect(count("navigation")).toBe(1);
    expect(count("main")).toBe(1);
    expect(count("complementary")).toBe(0);
    expect(screen.getByRole("contentinfo").elements()).toHaveLength(0);
    expect(screen.getByRole("search").elements()).toHaveLength(0);
    await expect
      .element(
        screen
          .getByRole("navigation", { name: "Views" })
          .getByRole("button", { name: "Collapse sidebar" }),
      )
      .toBeVisible();
  });

  // The sizes of the design handoff (doc/design/README.md, "Global
  // layout"), at the browser's default font size.
  test("has the handoff's header and sidebar sizes", async () => {
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();

    expect(
      screen.getByRole("banner").element().getBoundingClientRect().height,
    ).toBe(52);
    expect(sidebarWidth()).toBe(224);
  });

  // The header says what is known: no cluster. It must not look like a
  // connection that works.
  test("says in the header that there is no cluster", async () => {
    const screen = await renderApp("/overview");

    await expect
      .element(screen.getByRole("banner").getByText("No cluster"))
      .toBeVisible();
  });

  // The switcher has nothing to switch to. A keyboard user has to be able
  // to reach it all the same to find out why, which the disabled attribute
  // would prevent, and a screen reader has to read the reason with it.
  test("explains the cluster switcher that cannot be used yet", async () => {
    const screen = await renderApp("/overview");
    const switcher = screen.getByRole("button", { name: "Clusters" });

    await expect.element(switcher).toHaveAttribute("aria-disabled", "true");
    await expect
      .element(switcher)
      .toHaveAccessibleDescription(
        "No cluster is configured yet, so there is none to switch to.",
      );

    switcher.element().focus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
    await expect.element(switcher).toHaveFocus();
    await expect.element(screen.getByRole("tooltip")).toBeVisible();
  });
});

describe("the navigation", () => {
  test("lists every view of the view table under its group", async () => {
    const screen = await renderApp("/overview");
    const navigation = screen.getByRole("navigation", { name: "Views" });

    for (const view of views) {
      await expect
        .element(
          navigation
            .getByRole("list", { name: view.group })
            .getByRole("link", { name: view.title, exact: true }),
        )
        .toHaveAttribute("href", view.path);
    }
  });

  // aria-current is how a screen reader says "current page" on the link,
  // and it is what the active look is tied to.
  test("marks the link of the view that shows, and no other", async () => {
    const screen = await renderApp("/jobs");
    const current = () =>
      screen
        .getByRole("link")
        .elements()
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);

    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Jobs");
    expect(current()).toEqual(["Jobs"]);

    await screen.getByRole("link", { name: "Partitions" }).click();
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Partitions");
    expect(current()).toEqual(["Partitions"]);
  });

  // A view shows at its own address and at no other, and the navigation
  // marks the view that shows. A router left to itself reads all three of
  // these as "/nodes": the first as inside it, so that its link is marked
  // over the not-found view, the other two as the view itself, so that a
  // view has addresses the view table does not know.
  test.each(["/nodes/r07", "/Nodes", "/nodes/"])(
    "%s is the address of no view: it shows the not-found view and marks no link",
    async (address) => {
      const screen = await renderApp(address);

      await expect
        .element(screen.getByRole("main").getByRole("heading", { level: 1 }))
        .toHaveTextContent("Page not found");
      await expect
        .element(screen.getByRole("main").getByText(address, { exact: true }))
        .toBeVisible();
      expect(document.title).toBe("Page not found - sdash");
      expect(
        screen
          .getByRole("navigation", { name: "Views" })
          .getByRole("link")
          .elements()
          .filter((link) => link.hasAttribute("aria-current")),
      ).toEqual([]);
    },
  );

  test("the root address leads to the Overview", async () => {
    const screen = await renderApp("/");

    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Overview");
    await expect
      .element(screen.getByRole("link", { name: "Overview" }))
      .toHaveAttribute("aria-current", "page");
  });

  // An address no view has is a page like any other: the shell is there,
  // so the user can leave it, and it says which address was asked for.
  test("an unknown address shows the not-found view inside the shell", async () => {
    const screen = await renderApp("/no/such/view");

    await expect
      .element(screen.getByRole("main").getByRole("heading", { level: 1 }))
      .toHaveTextContent("Page not found");
    await expect
      .element(screen.getByRole("main").getByText("/no/such/view"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("navigation", { name: "Views" }))
      .toBeVisible();
    expect(document.title).toBe("Page not found - sdash");

    await screen.getByRole("link", { name: "Go to the Overview" }).click();
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Overview");
  });
});

describe("arriving at a view", () => {
  // A single-page application changes the content without loading a page,
  // and a screen reader says nothing unless the focus moves. It moves to
  // the heading, which is then read (WCAG 2.1, success criteria 2.4.3 and
  // 4.1.3 are what this serves).
  test("by a link moves the focus to the heading and names the document", async () => {
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Overview");
    expect(document.title).toBe("Overview - sdash");

    await screen.getByRole("link", { name: "Nodes" }).click();

    const heading = screen.getByRole("heading", { level: 1, name: "Nodes" });
    await expect.element(heading).toHaveFocus();
    expect(document.title).toBe("Nodes - sdash");
  });

  // The browser has just announced the page it loaded, and the focus
  // belongs at its top, where the skip link is.
  test("by loading the page leaves the focus at the top", async () => {
    const screen = await renderApp("/nodes");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toBeVisible();
    expect(focused()).toBe(document.body);
  });

  // The root address shows nothing and leads on to the Overview. That is
  // part of loading the page, though the address changes on the way.
  test("by being led on from the root address leaves the focus at the top", async () => {
    const screen = await renderApp("/");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Overview" }))
      .toBeVisible();
    await settled();
    expect(focused()).toBe(document.body);
    expect(document.title).toBe("Overview - sdash");

    // The next view is arrived at like any other.
    await userEvent.keyboard("gn");
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
  });

  test("by going back and forward moves the focus to the heading each time", async () => {
    const screen = await renderApp("/overview");
    await screen.getByRole("link", { name: "Jobs" }).click();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Jobs" }))
      .toHaveFocus();

    await screen.getByRole("button", { name: "Test: back" }).click();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Overview" }))
      .toHaveFocus();
    expect(document.title).toBe("Overview - sdash");

    await screen.getByRole("button", { name: "Test: forward" }).click();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Jobs" }))
      .toHaveFocus();
    expect(document.title).toBe("Jobs - sdash");
  });

  test("by the keys g and a letter moves the focus to the heading", async () => {
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Overview");

    await userEvent.keyboard("gn");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
  });
});

describe("the skip link", () => {
  // WCAG 2.1, success criterion 2.4.1: a keyboard user gets past the
  // header and the twelve links of the navigation with one key.
  test("is the first stop of the Tab key and leads to the content", async () => {
    const screen = await renderApp("/nodes");
    const heading = screen.getByRole("heading", { level: 1, name: "Nodes" });
    await expect.element(heading).toBeVisible();

    await userEvent.tab();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    await expect.element(skip).toHaveFocus();
    await expect.element(skip).toBeInViewport();

    await userEvent.keyboard("{Enter}");
    await expect.element(heading).toHaveFocus();
  });
});

describe("the main region", () => {
  // A keyboard scrolls the region the focus is in. A view may hold nothing
  // that takes the focus, and the region then has to take it itself, or a
  // user who came by the Tab key could not read to the end (WCAG 2.1,
  // success criterion 2.1.1). With nothing to scroll it must not be a stop
  // of the Tab key that does nothing.
  test("is a stop of the Tab key while it has something to scroll, and only then", async () => {
    const screen = await renderApp("/overview");
    await expect.element(screen.getByText("v1.4.0")).toBeVisible();
    const main = screen.getByRole("main").element();
    await expect.poll(() => main.tabIndex).toBe(-1);

    await page.viewport(1280, 220);
    await expect.poll(() => main.tabIndex).toBe(0);
    expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);

    screen.getByRole("button", { name: "Collapse sidebar" }).element().focus();
    await userEvent.tab();
    await expect.element(screen.getByRole("main")).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.poll(() => main.scrollTop).toBeGreaterThan(0);

    await page.viewport(1280, 720);
    await expect.poll(() => main.tabIndex).toBe(-1);
  });

  // The region stays while the views change inside it.
  test("shows a view from its top, wherever the last one was left", async () => {
    await page.viewport(1280, 220);
    const screen = await renderApp("/overview");
    await expect.element(screen.getByText("v1.4.0")).toBeVisible();
    const main = screen.getByRole("main").element();
    main.scrollTo(0, main.scrollHeight);
    expect(main.scrollTop).toBeGreaterThan(0);

    await screen.getByRole("link", { name: "Nodes" }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
    expect(main.scrollTop).toBe(0);
  });
});

describe("the shortcuts of the shell", () => {
  // The registry reports two shortcuts with the same keys in one scope
  // (shortcuts/registry.ts). The application is rendered as main.tsx
  // mounts it, in strict mode, where React mounts everything twice: the
  // shell must come through its ways of registering, mounting, a dialog
  // that opens over it, a sidebar that changes its shortcut's state and a
  // change of view, without ever registering a key twice.
  test("are never registered twice", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const screen = await renderApp("/overview");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();

    await pressModK();
    await expect.element(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("{Escape}?");
    await expect
      .element(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}[[gn");
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
      .toHaveFocus();
    await page.viewport(360, 740);
    await expect.poll(sidebarWidth).toBe(60);

    const reports = errors.mock.calls.map((call) => call.join(" "));
    errors.mockRestore();
    expect(reports.filter((text) => text.includes("registered twice"))).toEqual(
      [],
    );
  });
});

// The toggle is the last control of the header, at the right edge of the
// window. Its hint starts at the button and would run off that edge.
describe("the hint of the theme toggle", () => {
  test.each([1280, 360, 320])(
    "is on a screen %d px wide in full, below its button",
    async (width) => {
      await page.viewport(width, 740);
      const screen = await renderApp("/overview");
      const toggle = screen.getByRole("button", { name: "Dark theme" });

      toggle.element().focus();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
      await expect.element(toggle).toHaveFocus();
      const label = () =>
        toggle
          .element()
          .querySelector<HTMLElement>(
            ":scope > span[aria-hidden='true'] > span",
          );
      await expect.element(label()).toBeVisible();

      await expect
        .poll(() => label()?.getBoundingClientRect().right)
        .toBeLessThanOrEqual(width);
      const box = label()?.getBoundingClientRect();
      expect(box?.left).toBeGreaterThanOrEqual(0);
      expect(box?.top).toBeGreaterThanOrEqual(
        toggle.element().getBoundingClientRect().bottom,
      );
      expect(label()?.textContent).toBe("Dark themet");
    },
  );
});

describe("the shortcuts of a view", () => {
  // What the shell renders as its view is in the "view" scope, which wins
  // over the shell's own for the same key
  // (doc/adr/0024-addresses-and-keyboard-in-the-shell.md): a view may give
  // "t" a meaning of its own, and the theme then stays as it is.
  test("win over the shell's for the same key", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <MemoryRouter initialEntries={["/overview"]}>
        <Shell>
          <Registers shortcuts={[logging(log, shellKeys.theme, "view")]} />
        </Shell>
      </MemoryRouter>,
    );
    await expect.element(screen.getByRole("main")).toBeInTheDocument();

    await userEvent.keyboard(shellKeys.theme);

    expect(log).toEqual(["view"]);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
