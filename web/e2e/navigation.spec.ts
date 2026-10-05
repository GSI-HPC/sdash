// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, type Page, test } from "@playwright/test";

import { views } from "../src/routing/views.ts";
import {
  heading,
  open,
  openAt,
  pressPaletteKeys,
  reload,
  tabKey,
} from "./support.ts";

// The three ways from one view to another, and the browser's own two back
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md). Each has to end
// the same way: the address, the title and the heading are the view's, the
// navigation marks its link, and the focus is on the heading, which is how
// a screen reader comes to announce a page that was not loaded.

/** Checks that the page shows a view and has made it known. */
async function expectArrivedAt(page: Page, title: string): Promise<void> {
  const view = views.find((row) => row.title === title);
  if (!view) {
    throw new Error(`the view table has no view called ${title}`);
  }
  await expect(heading(page)).toHaveText(title);
  await expect(heading(page)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`${view.path}$`));
  await expect(page).toHaveTitle(`${title} - sdash`);
  await expect(page.locator('[aria-current="page"]')).toHaveText(title);
}

test("a click in the navigation goes to the view", async ({ page }) => {
  const problems = await open(page);
  await expect(heading(page)).toHaveText("Overview");

  await page
    .getByRole("navigation", { name: "Views" })
    .getByRole("link", { name: "Nodes" })
    .click();

  await expectArrivedAt(page, "Nodes");
  expect(problems).toEqual([]);
});

test("every link of the navigation goes to its view", async ({ page }) => {
  const problems = await open(page);
  const navigation = page.getByRole("navigation", { name: "Views" });

  // Backwards, so that the first click already leaves the Overview.
  for (const view of views.toReversed()) {
    await navigation
      .getByRole("link", { name: view.title, exact: true })
      .click();
    await expectArrivedAt(page, view.title);
  }
  expect(problems).toEqual([]);
});

test("the keys g and a letter go to the view", async ({ page }) => {
  const problems = await open(page);
  await expect(heading(page)).toHaveText("Overview");

  for (const view of views.toReversed()) {
    await page.keyboard.press("g");
    await page.keyboard.press(view.goKey);
    await expectArrivedAt(page, view.title);
  }
  expect(problems).toEqual([]);
});

test("the command palette goes to the view", async ({ page }) => {
  const problems = await open(page);
  await expect(heading(page)).toHaveText("Overview");

  await pressPaletteKeys(page);
  const field = page.getByRole("combobox", {
    name: "Search views and actions",
  });
  await expect(field).toBeFocused();
  await field.pressSequentially("partit");
  await expect(page.getByRole("option", { selected: true })).toHaveText(
    /^Partitions/,
  );
  await page.keyboard.press("Enter");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectArrivedAt(page, "Partitions");
  expect(problems).toEqual([]);
});

test("the palette opens from the header and is left by Escape", async ({
  page,
}) => {
  const problems = await open(page);
  const search = page.getByRole("button", {
    name: "Search views and actions",
  });

  // By the keyboard: not every browser gives a button the focus on a
  // click, and the focus is what has to come back.
  await search.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(views.length + 4);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(search).toBeFocused();

  // And by the pointer.
  await search.click();
  await expect(page.getByRole("combobox")).toBeFocused();
  expect(problems).toEqual([]);
});

// The address of a view is a real address. The browser's history holds
// one entry for each view that was gone to, and its own buttons walk it.
test("the browser's Back and Forward go through the views that were visited", async ({
  page,
}) => {
  const problems = await open(page);
  const navigation = page.getByRole("navigation", { name: "Views" });
  await navigation.getByRole("link", { name: "Jobs", exact: true }).click();
  await expectArrivedAt(page, "Jobs");
  await page.keyboard.press("g");
  await page.keyboard.press("q");
  await expectArrivedAt(page, "QOS & fairshare");

  await page.goBack();
  await expectArrivedAt(page, "Jobs");
  await page.goBack();
  await expectArrivedAt(page, "Overview");
  await page.goForward();
  await expectArrivedAt(page, "Jobs");

  expect(problems).toEqual([]);
});

// The root address leads on to the Overview by replacing its entry. With
// an entry of its own, Back from the Overview would land on the root and
// be sent forward again: the user could not leave sdash by Back at all.
test("Back from the view the root address leads to leaves it behind", async ({
  page,
}) => {
  // Signed in, then to a page that is not the interface, which is where
  // Back has to lead: what a browser makes of its very first entry differs
  // from engine to engine.
  await open(page);
  const before = new URL("/api/v1/status", page.url()).href;
  await page.goto(before);

  await page.goto(new URL("/", before).href);
  await expect(heading(page)).toHaveText("Overview");
  await expect(page).toHaveURL(/\/overview$/);
  await page.goBack();

  await expect(page).toHaveURL(before);
});

// "g" and "o" on the Overview goes nowhere, and neither does choosing the
// Overview in the palette there. An entry in the history for each would
// make Back seem to do nothing, once for every time.
test("going to the view that shows already adds nothing to the history", async ({
  page,
}) => {
  const problems = await open(page);
  await expect(heading(page)).toHaveText("Overview");
  const entries = () => page.evaluate(() => history.length);
  const before = await entries();

  await page.keyboard.press("g");
  await page.keyboard.press("o");
  await page.keyboard.press("g");
  await page.keyboard.press("o");
  await pressPaletteKeys(page);
  const field = page.getByRole("combobox");
  await field.pressSequentially("overview");
  await expect(page.getByRole("option", { selected: true })).toHaveText(
    /^Overview/,
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // A link of the navigation adds none either.
  await page
    .getByRole("navigation", { name: "Views" })
    .getByRole("link", { name: "Overview" })
    .click();

  // The entries are counted once a later step has been seen to act, the
  // one that does go somewhere: counted at once, they would be as many as
  // before on any page that has not got to the keys yet. The one entry
  // more is that step's, so the steps before it added none.
  await page.keyboard.press("g");
  await page.keyboard.press("n");
  await expectArrivedAt(page, "Nodes");
  expect(await entries()).toBe(before + 1);
  // And Back leads to the Overview once, not through copies of it.
  await page.goBack();
  await expectArrivedAt(page, "Overview");
  expect(problems).toEqual([]);
});

// A mouse has a button for Back and a trackpad a swipe, and neither can a
// dialog keep to itself. The view behind the dialog changes and takes the
// focus to its heading, which is hidden from a screen reader behind an
// open dialog: so the dialog goes with the view it was opened over.
for (const dialog of ["command palette", "keyboard help"] as const) {
  test(`the browser's Back closes the ${dialog} with the view it was opened over`, async ({
    page,
  }) => {
    const problems = await openAt(page, "/nodes");
    await expect(heading(page)).toHaveText("Nodes");
    await page
      .getByRole("navigation", { name: "Views" })
      .getByRole("link", { name: "Jobs", exact: true })
      .click();
    await expectArrivedAt(page, "Jobs");
    if (dialog === "command palette") {
      await pressPaletteKeys(page);
      await expect(page.getByRole("combobox")).toBeFocused();
    } else {
      await page.keyboard.press("?");
      await expect(page.getByRole("dialog")).toBeVisible();
    }

    await page.goBack();

    await expectArrivedAt(page, "Nodes");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Nothing of the page is left hidden from assistive technology, and
    // the page's keys are its own again.
    await expect(page.locator('#root[aria-hidden="true"]')).toHaveCount(0);
    await page.keyboard.press("g");
    await page.keyboard.press("p");
    await expectArrivedAt(page, "Partitions");
    expect(problems).toEqual([]);
  });
}

// The view is in the address and nowhere else, so a reload shows it again,
// loaded this time, and the focus stays at the top of the new page.
test("a reload stays on the view", async ({ page }) => {
  const problems = await openAt(page, "/diagnostics");
  await expect(heading(page)).toHaveText("Diagnostics");

  await reload(page);

  await expect(heading(page)).toHaveText("Diagnostics");
  await expect(page).toHaveURL(/\/diagnostics$/);
  // The title is set by the heading in the step in which it would take
  // the focus, so once the title is there the focus has been left alone.
  await expect(page).toHaveTitle("Diagnostics - sdash");
  await expect(page.locator("body")).toBeFocused();
  expect(problems).toEqual([]);
});

// The files of the views, as the build names them: the name of the view's
// module, a hash of its content, ".js". A test holds one back or has it
// fail, as a slow or a stopped sdash would.
function fileOf(view: string): RegExp {
  return new RegExp(`/assets/${view}-[^/]+\\.js$`);
}

// A view whose file cannot be fetched, because sdash was stopped or
// replaced since the page was opened, is reported in its place. The report
// is where the user arrived: it names the document and takes the focus, as
// the view would have, and the way back is an arrival like any other. Left
// out of it, the tab would keep the title of the view before, and Back
// would move no focus, as if the user had never left.
test("a view that cannot be fetched is arrived at as its report, and left again", async ({
  page,
}) => {
  await open(page);
  await expect(heading(page)).toHaveText("Overview");
  await page.route(fileOf("Nodes"), (route) => route.abort());

  await page
    .getByRole("navigation", { name: "Views" })
    .getByRole("link", { name: "Nodes" })
    .click();

  const report = page.getByRole("alert").getByRole("heading", { level: 1 });
  await expect(report).toHaveText("This view did not load");
  await expect(report).toBeFocused();
  await expect(page).toHaveTitle("This view did not load - sdash");
  await expect(page).toHaveURL(/\/nodes$/);
  // The navigation still says which view the address is.
  await expect(page.locator('[aria-current="page"]')).toHaveText("Nodes");

  await page.goBack();
  await expectArrivedAt(page, "Overview");
  // The views that were not asked for yet still load.
  await page.keyboard.press("g");
  await page.keyboard.press("j");
  await expectArrivedAt(page, "Jobs");
});

// A user who knows the keys can be faster than the first view: the shell
// is there and acts on "g" and "n" while the file of the Overview is still
// on its way. The view that then shows is the first to show at all, and it
// was navigated to all the same, so its heading takes the focus.
test("a view gone to before the first one has shown is arrived at", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(fileOf("Overview"), async (route) => {
    await held;
    await route.continue();
  });
  const problems = await open(page, { until: "domcontentloaded" });
  // The shell is there and no view is. That the root address has led on
  // to the one of the Overview also says that the shell is listening: it
  // starts to in the step in which it is led on.
  await expect(page.getByRole("navigation", { name: "Views" })).toBeVisible();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(heading(page)).toHaveCount(0);

  await page.keyboard.press("g");
  await page.keyboard.press("n");

  await expectArrivedAt(page, "Nodes");

  // The file that was held back arrives after all and changes nothing:
  // the next key still finds the page on the Nodes view.
  const arriving = page.waitForResponse((response) =>
    fileOf("Overview").test(response.url()),
  );
  release();
  await (await arriving).finished();
  await expectArrivedAt(page, "Nodes");
  await page.keyboard.press("g");
  await page.keyboard.press("j");
  await expectArrivedAt(page, "Jobs");
  expect(problems).toEqual([]);
});

// The root address leads to the Overview, and until the file of that view
// has arrived the shell still stands at the root. A dialog opened in that
// moment was opened over the Overview: it stays when the view arrives, and
// would have closed by itself if the shell took being led on for a change
// of view.
test("the keyboard help opened before the first view has shown stays open when the view arrives", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(fileOf("Overview"), async (route) => {
    await held;
    await route.continue();
  });
  const problems = await open(page, { until: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "Views" })).toBeVisible();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(heading(page)).toHaveCount(0);

  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();

  const arriving = page.waitForResponse((response) =>
    fileOf("Overview").test(response.url()),
  );
  release();
  await (await arriving).finished();
  // The view is there, behind the dialog, where no role is asked of it.
  await expect(page.locator("main h1")).toHaveText("Overview");
  await expect(help).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(heading(page)).toHaveText("Overview");
  expect(problems).toEqual([]);
});

test("the not-found view leads back to a view", async ({ page }) => {
  const problems = await openAt(page, "/nowhere");
  await expect(heading(page)).toHaveText("Page not found");

  await page.getByRole("link", { name: "Go to the Overview" }).click();

  await expectArrivedAt(page, "Overview");
  expect(problems).toEqual([]);
});

// WCAG 2.1, success criterion 2.4.1: one key gets a keyboard user past the
// header and the navigation.
test("the skip link is the first stop of the Tab key and leads to the content", async ({
  page,
  browserName,
}) => {
  const problems = await openAt(page, "/jobs");
  await expect(heading(page)).toHaveText("Jobs");

  await page.keyboard.press(tabKey(browserName));
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");

  await expect(heading(page)).toBeFocused();
  // The jump is no change of address: Back must not have to undo it.
  await expect(page).toHaveURL(/\/jobs$/);
  expect(problems).toEqual([]);
});
