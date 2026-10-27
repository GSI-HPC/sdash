// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, type Page, test } from "@playwright/test";

import { button, openGallery, press, section, tabTo } from "./gallery.ts";
import { scan, tabKey, tooltips } from "./support.ts";

// The primitives that show data, in the binary and by the keyboard alone:
// the cell grid, the banner that can be dismissed, the retry of an error
// panel (doc/adr/0030-primitives-that-show-data.md). What each does in
// detail is in the component tests beside it; the scan of the gallery with
// the grid's tooltip showing, and the gallery in a small window, go
// through the list of overlays in gallery.ts.

/** The grid of 120 cells of the gallery. */
function grid(page: Page) {
  return section(page, "CellGrid").getByRole("grid", { name: "Example cells" });
}

/** The name of the cell the grid says has the focus. */
async function focusedCell(page: Page): Promise<string | null> {
  return grid(page).evaluate((element) => {
    const id = element.getAttribute("aria-activedescendant");
    return id === null
      ? null
      : (document.getElementById(id)?.getAttribute("aria-label") ?? null);
  });
}

test("the cell grid is one stop of the Tab key, gone through by the arrow keys and pressed by Enter", async ({
  page,
  browserName,
}) => {
  const problems = await openGallery(page);
  await tabTo(
    page,
    browserName,
    section(page, "Card").getByRole("link", { name: "More examples" }),
    grid(page),
  );

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const name = await focusedCell(page);
  expect(name).toMatch(/^Cell \d+, /);
  const label = name?.split(",")[0] ?? "";
  await expect(tooltips(page)).toHaveText([new RegExp(`^${label}\\D`)]);
  await page.keyboard.press("Enter");
  await expect(section(page, "CellGrid").getByRole("status")).toHaveText(
    `Pressed ${label}.`,
  );

  // One press of the Tab key leaves the grid, whatever its cells.
  await page.keyboard.press(tabKey(browserName));
  await expect(button(page, "CellGrid", "Show 4,000 cells")).toBeFocused();
  await expect(tooltips(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});

// The pointer rests before the tooltip comes, as with every tooltip, and
// the keyboard takes it back at once.
test("the tooltip of the grid comes to the cell the pointer rests on, and goes with the keyboard", async ({
  page,
  browserName,
}) => {
  const problems = await openGallery(page);
  const cells = grid(page).getByRole("gridcell");
  await cells.nth(14).scrollIntoViewIfNeeded();

  await cells.nth(14).hover();
  await expect(tooltips(page)).toHaveText([/^Cell 15\D/]);
  await tabTo(
    page,
    browserName,
    section(page, "Card").getByRole("link", { name: "More examples" }),
    grid(page),
  );
  await expect(tooltips(page)).toHaveText([/^Cell 1\D/]);
  expect(problems).toEqual([]);
});

// Four thousand cells on the page at once: drawn, gone through to the
// last one by the keyboard, and scanned.
test("the grid of 4,000 cells shows, takes the keyboard to its last cell and passes the axe scan", async ({
  page,
}) => {
  test.slow();
  const problems = await openGallery(page);

  await press(page, button(page, "CellGrid", "Show 4,000 cells"));
  const large = section(page, "CellGrid").getByRole("grid", {
    name: "Many example cells",
  });
  await expect(large.getByRole("gridcell")).toHaveCount(4000);
  await large.focus();
  await page.keyboard.press("Control+End");
  await expect(tooltips(page)).toHaveText([/^Cell 4000\D/]);
  await expect(tooltips(page)).toBeInViewport();
  expect(await scan(page)).toEqual([]);
  expect(problems).toEqual([]);
});

// Gone with the button that had the focus, the focus would fall to the
// body, and the next Tab would start at the top of the page.
test("a banner dismissed by the keyboard hands the focus to what follows it", async ({
  page,
}) => {
  const problems = await openGallery(page);
  const banners = section(page, "Banner");

  await press(page, banners.getByRole("button", { name: "Dismiss" }));

  await expect(banners.getByText("Example that can be dismissed")).toHaveCount(
    0,
  );
  await expect(
    banners.getByRole("button", { name: "Show the banner again" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    banners.getByText("Example that can be dismissed"),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("the retry of an error panel is pressed by the keyboard", async ({
  page,
}) => {
  const problems = await openGallery(page);
  const panel = section(page, "ErrorPanel");

  await press(page, panel.getByRole("button", { name: "Retry" }));
  await expect(panel.getByRole("status")).toHaveText("Tried again 1 time.");
  expect(problems).toEqual([]);
});
