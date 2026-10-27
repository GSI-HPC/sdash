// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { pressModK, renderApp, resetPage, settled } from "../testing/app";
import { shownTooltips } from "../testing/tooltips";
import { galleryPath, galleryTitle, sections } from "./page";

// The gallery as a page of the application: how it is reached, what it is
// made of, and what happens to it when the address changes. What each
// primitive does is tested beside the primitive, and the gallery in the
// binary, with the accessibility scan, in web/e2e/gallery.spec.ts.

beforeEach(async () => {
  resetPage();
  await page.viewport(1280, 720);
});

type Screen = Awaited<ReturnType<typeof renderApp>>;

/** The heading of the gallery, once the file of the gallery has arrived. */
async function shown(screen: Screen) {
  const heading = screen.getByRole("heading", { level: 1, name: galleryTitle });
  await expect.element(heading).toBeVisible();
  return heading;
}

/** The region of a section, which is named by the heading of the section. */
function section(screen: Screen, title: string) {
  return screen.getByRole("region", { name: title, exact: true });
}

// The gallery is a page with the title and the heading of one, and it is
// no view: nothing in the navigation is marked as the page that shows.
test("shows at its address with its heading and marks no link of the navigation", async () => {
  const screen = await renderApp(galleryPath);

  await shown(screen);
  expect(document.title).toBe(`${galleryTitle} - sdash`);
  const links = screen
    .getByRole("navigation", { name: "Views" })
    .getByRole("link")
    .elements();
  expect(links.length).toBeGreaterThan(0);
  expect(links.filter((link) => link.hasAttribute("aria-current"))).toEqual([]);
  expect(links.map((link) => link.getAttribute("href"))).not.toContain(
    galleryPath,
  );
});

// No link leads to the gallery, so the palette is how a user finds it,
// and arriving there is an arrival like at a view.
test("is opened from the command palette, with the focus on its heading", async () => {
  const screen = await renderApp("/overview");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Overview" }))
    .toBeVisible();

  await pressModK();
  await userEvent.keyboard("gallery");
  await expect
    .element(screen.getByRole("option", { selected: true }))
    .toHaveTextContent("Open the component gallery");
  await userEvent.keyboard("{Enter}");

  const heading = await shown(screen);
  await expect.element(heading).toHaveFocus();
  expect(document.title).toBe(`${galleryTitle} - sdash`);
  expect(screen.getByRole("dialog").elements()).toEqual([]);
});

// As for a view: going to the page that shows already is no arrival, and
// an entry in the history for it would make Back seem to do nothing.
test("opened from the palette while it shows already, adds nothing to the history", async () => {
  const screen = await renderApp("/nodes");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toBeVisible();
  for (let time = 0; time < 2; time++) {
    await pressModK();
    await userEvent.keyboard("gallery{Enter}");
    await shown(screen);
    await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  }

  await screen.getByRole("button", { name: "Test: back" }).click();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toHaveFocus();
});

// The list of sections is what the page is made from, the tests of the
// binary go through, and the links at the top lead to.
test("has a section for every primitive, each with its heading, and a link to each", async () => {
  const screen = await renderApp(galleryPath);
  await shown(screen);

  const headings = screen
    .getByRole("main")
    .getByRole("heading", { level: 2 })
    .elements();
  expect(headings.map((heading) => heading.textContent)).toEqual(
    sections.map(({ title }) => title),
  );
  expect(headings.map((heading) => heading.id)).toEqual(
    sections.map(({ id }) => id),
  );
  for (const { title } of sections) {
    // A section with nothing in it would show its heading and no more.
    expect(
      section(screen, title).getByRole("heading", { level: 3 }).elements()
        .length,
      title,
    ).toBeGreaterThan(0);
  }

  const links = screen
    .getByRole("list", { name: "Sections" })
    .getByRole("link")
    .elements();
  expect(links.map((link) => link.textContent)).toEqual(
    sections.map(({ title }) => title),
  );
  expect(links.map((link) => link.getAttribute("href"))).toEqual(
    sections.map(({ id }) => `${galleryPath}#${id}`),
  );
});

// The fragment of the address names a section, as on a page the browser
// loads: the section is scrolled to and its heading has the focus, so
// that the Tab key goes on from there and a screen reader reads from
// there.
test("goes to the section a link of its list names, and gives its heading the focus", async () => {
  const screen = await renderApp(galleryPath);
  await shown(screen);
  const main = screen.getByRole("main").element();
  expect(main.scrollTop).toBe(0);

  const link = screen
    .getByRole("list", { name: "Sections" })
    .getByRole("link", { name: "Drawer" });
  link.element().focus();
  await userEvent.keyboard("{Enter}");

  const heading = screen.getByRole("heading", { level: 2, name: "Drawer" });
  await expect.element(heading).toHaveFocus();
  expect(main.scrollTop).toBeGreaterThan(0);
  await expect.element(heading).toBeInViewport();
  // The page header keeps the title: the section is part of the page.
  expect(document.title).toBe(`${galleryTitle} - sdash`);

  // A second press on the same link is a new arrival at the section.
  main.scrollTo(0, 0);
  link.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(heading).toHaveFocus();
  expect(main.scrollTop).toBeGreaterThan(0);
});

// Arrived at from a view, the shell scrolls the main region to its top
// and gives the focus to the page header, both after the gallery is on
// the page. The section the address names still wins.
test("arrived at with the fragment of a section, shows that section and not its top", async () => {
  const screen = await renderApp(`${galleryPath}#toast`);
  const heading = screen.getByRole("heading", { level: 2, name: "Toast" });
  await expect.element(heading).toHaveFocus();
  await expect.element(heading).toBeInViewport();

  // Away to a view and back, with the gallery loaded already.
  await userEvent.keyboard("gn");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toHaveFocus();
  await screen.getByRole("button", { name: "Test: back" }).click();

  await expect.element(heading).toHaveFocus();
  await expect.element(heading).toBeInViewport();
  expect(screen.getByRole("main").element().scrollTop).toBeGreaterThan(0);
});

// A dialog of a view is rendered by the view, and goes with it. Left on
// the page, it would lie over a heading that has the focus and is hidden
// from a screen reader.
test("a dialog open in it goes with it when the address changes, and the focus is on the heading of the view that shows", async () => {
  const screen = await renderApp("/nodes");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toBeVisible();
  await pressModK();
  await userEvent.keyboard("gallery{Enter}");
  await expect.element(await shown(screen)).toHaveFocus();

  const opener = section(screen, "Dialog").getByRole("button", {
    name: "Open dialog",
    exact: true,
  });
  opener.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("dialog", { name: "Example dialog" }))
    .toBeVisible();

  // As the browser's own button does it: without a press on the page,
  // which the dialog would take for a press outside it. The button is
  // found by its text, since the page behind a dialog is hidden from a
  // search by role.
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent === "Test: back")
    ?.click();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toHaveFocus();
  await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
  // Nothing of the page is left hidden from assistive technology, and
  // the keys of the page are its own again.
  await expect
    .poll(() => document.activeElement?.closest('[aria-hidden="true"]'))
    .toBeNull();
  await userEvent.keyboard("gj");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Jobs" }))
    .toHaveFocus();
});

// The one shortcut the gallery has: it is the key its toggle shows, so it
// has to do what the toggle does, and it is the gallery's alone.
test("presses its toggle by the key the toggle shows, and only while the gallery shows", async () => {
  const screen = await renderApp(galleryPath);
  await shown(screen);
  const toggle = section(screen, "IconButton").getByRole("button", {
    name: "Lock example",
  });
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.element(toggle).toHaveAttribute("aria-keyshortcuts", "L");

  await userEvent.keyboard("l");
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");

  // The tooltip names the key beside the name of the button.
  screen.getByRole("button", { name: "Large icon" }).element().focus();
  await userEvent.tab();
  await expect.element(toggle).toHaveFocus();
  await expect.poll(shownTooltips).toEqual(["Lock examplel"]);

  // On a view the key does nothing: the next key, which does act there,
  // is waited for first.
  await userEvent.keyboard("gn");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Nodes" }))
    .toHaveFocus();
  await userEvent.keyboard("l");
  await settled();
  await userEvent.keyboard("?");
  const help = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect.element(help).toBeVisible();
  expect(help.getByText("Lock or unlock the example").elements()).toEqual([]);
});
