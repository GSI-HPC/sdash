// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { shownTooltipElements, shownTooltips } from "../testing/tooltips";
import { CellGrid, type CellGridProps, type GridCell } from "./CellGrid";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

/** Cells numbered from 1, every third a warning, the fifth with a detail. */
function cellsOf(count: number): GridCell[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `cell-${String(index + 1)}`,
    label: `Cell ${String(index + 1)}`,
    tone: (index + 1) % 3 === 0 ? "warn" : "ok",
    ...(index === 4 ? { detail: "Example detail" } : {}),
  }));
}

const tones = [
  { tone: "ok", label: "Fine" },
  { tone: "warn", label: "Warning" },
] as const;

/**
 * A grid of 23 cells 127 px wide, which is 10 cells to a row, between two
 * buttons, below a text for the pointer to rest on: the tests of a file
 * share one pointer.
 */
async function renderGrid(props: Partial<CellGridProps> = {}) {
  const screen = await render(
    <div className="m-16 flex flex-col gap-4">
      <p>Somewhere else</p>
      <button type="button">Before</button>
      <div className="w-[127px]">
        <CellGrid
          label="Example cells"
          cells={cellsOf(23)}
          tones={tones}
          {...props}
        />
      </div>
      <button type="button">After</button>
    </div>,
  );
  await userEvent.hover(screen.getByText("Somewhere else"));
  const grid = screen.getByRole("grid", { name: "Example cells" });
  return { screen, grid };
}

/** The cell with the given number, counted from 1. */
function cell(number: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-cell="${String(number - 1)}"]`,
  );
  if (!element) {
    throw new Error(`there is no cell ${String(number)}`);
  }
  return element;
}

/** The name of the cell that has the focus inside the grid. */
function focusedCell(grid: Element): string | null {
  const id = grid.getAttribute("aria-activedescendant");
  return id === null
    ? null
    : (document.getElementById(id)?.getAttribute("aria-label") ?? null);
}

/** Puts the focus on the grid with the Tab key, from the button before it. */
async function tabIntoGrid(grid: { element(): Element }) {
  await userEvent.click(document.querySelector("button") as HTMLElement);
  await userEvent.tab();
  expect(document.activeElement).toBe(grid.element());
}

// Thousands of cells, each a stop of the Tab key, would leave whoever moves
// by the keyboard no way past the grid.
test("is one stop of the Tab key, whatever the number of its cells", async () => {
  const { screen, grid } = await renderGrid();

  await tabIntoGrid(grid);
  expect(grid.element().querySelectorAll("[tabindex]")).toHaveLength(0);
  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "After" }))
    .toHaveFocus();
});

test("names each cell by its label, the word of its tone and its detail", async () => {
  const { grid } = await renderGrid();
  const names = grid
    .getByRole("gridcell")
    .elements()
    .map((element) => element.getAttribute("aria-label"));

  expect(names).toHaveLength(23);
  expect(names.slice(0, 5)).toEqual([
    "Cell 1, Fine",
    "Cell 2, Fine",
    "Cell 3, Warning",
    "Cell 4, Fine",
    "Cell 5, Fine, Example detail",
  ]);
});

test("lists in its legend how many cells have each tone", async () => {
  const { screen } = await renderGrid();

  expect(
    screen
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["Fine16", "Warning7"]);
});

// The rows are what Up and Down move through, so they have to be the rows
// the eye sees.
test("lays its cells out in rows of as many as fit, and again when its width changes", async () => {
  const { grid } = await renderGrid();
  const rowLengths = () =>
    grid
      .getByRole("row")
      .elements()
      .map((row) => row.children.length);

  expect(rowLengths()).toEqual([10, 10, 3]);
  const box = grid.element().parentElement?.parentElement;
  box?.classList.replace("w-[127px]", "w-16");
  await expect.poll(rowLengths).toEqual([5, 5, 5, 5, 3]);
  expect(cell(6).getBoundingClientRect().top).toBeGreaterThan(
    cell(5).getBoundingClientRect().top,
  );
});

// An item of a flex row is as wide as what it holds, which before the grid
// has measured is its legend alone, here a short one.
test("takes the width of its container when its parent shrinks to fit", async () => {
  const screen = await render(
    <div className="flex w-[127px]">
      <CellGrid label="Example cells" cells={cellsOf(23)} tones={[tones[0]]} />
    </div>,
  );

  await expect
    .poll(() =>
      screen
        .getByRole("row")
        .elements()
        .map((row) => row.children.length),
    )
    .toEqual([10, 10, 3]);
});

test("moves the focus by the arrow keys, Home and End, and names the cell that has it", async () => {
  const { grid } = await renderGrid();
  await tabIntoGrid(grid);

  expect(focusedCell(grid.element())).toBe("Cell 1, Fine");
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  expect(focusedCell(grid.element())).toBe("Cell 3, Warning");
  await userEvent.keyboard("{ArrowDown}");
  expect(focusedCell(grid.element())).toBe("Cell 13, Fine");
  await userEvent.keyboard("{End}");
  expect(focusedCell(grid.element())).toBe("Cell 20, Fine");
  await userEvent.keyboard("{ArrowDown}");
  expect(focusedCell(grid.element())).toBe("Cell 20, Fine");
  await userEvent.keyboard("{Home}{ArrowUp}");
  expect(focusedCell(grid.element())).toBe("Cell 1, Fine");
  await userEvent.keyboard("{Control>}{End}{/Control}");
  expect(focusedCell(grid.element())).toBe("Cell 23, Fine");
  await userEvent.keyboard("{Control>}{Home}{/Control}");
  expect(focusedCell(grid.element())).toBe("Cell 1, Fine");
});

// A key the grid takes must not also scroll the page or reach a shortcut
// of the shell, which leaves a key whose default was prevented alone
// (shortcuts/registry.ts). Alt and an arrow is the browser's: back and
// forward in the history.
test("keeps the keys it takes from the page, and leaves it every other", async () => {
  const { grid } = await renderGrid();
  const reached: { key: string; prevented: boolean }[] = [];
  const listen = (event: KeyboardEvent) => {
    reached.push({ key: event.key, prevented: event.defaultPrevented });
  };
  await tabIntoGrid(grid);
  document.addEventListener("keydown", listen);
  try {
    await userEvent.keyboard("{ArrowLeft}{ArrowDown}g{Alt>}{ArrowRight}{/Alt}");
  } finally {
    document.removeEventListener("keydown", listen);
  }

  expect(reached.filter(({ key }) => key !== "Alt")).toEqual([
    { key: "ArrowLeft", prevented: true },
    { key: "ArrowDown", prevented: true },
    { key: "g", prevented: false },
    { key: "ArrowRight", prevented: false },
  ]);
  expect(focusedCell(grid.element())).toBe("Cell 11, Fine");
});

test("presses the cell that has the focus with Enter and Space, and a cell that is clicked", async () => {
  const pressed = vi.fn<(cell: GridCell) => void>();
  const { grid } = await renderGrid({ onActivate: pressed });
  await tabIntoGrid(grid);

  await userEvent.keyboard("{ArrowRight}{Enter}{ArrowRight} ");
  await userEvent.click(cell(7));

  expect(pressed.mock.calls.map(([{ label }]) => label)).toEqual([
    "Cell 2",
    "Cell 3",
    "Cell 7",
  ]);
  expect(focusedCell(grid.element())).toBe("Cell 7, Fine");
});

test("lets Enter and Space through when no cell can be pressed", async () => {
  const { grid } = await renderGrid();
  let prevented = true;
  const listen = (event: KeyboardEvent) => {
    prevented = event.defaultPrevented;
  };
  await tabIntoGrid(grid);
  document.addEventListener("keydown", listen);
  try {
    await userEvent.keyboard("{Enter}");
  } finally {
    document.removeEventListener("keydown", listen);
  }

  expect(prevented).toBe(false);
});

// The ring is drawn on the cell, which is what the keyboard is on; the
// grid's own ring would frame thousands of cells and say nothing.
test("draws the ring of the keyboard focus around the cell that has it, and none for a click", async () => {
  const { grid } = await renderGrid();
  const outline = (number: number) =>
    getComputedStyle(cell(number)).outlineStyle;

  await userEvent.click(cell(4));
  expect(outline(4)).toBe("none");
  await userEvent.keyboard("{ArrowRight}");
  expect(outline(5)).toBe("solid");
  expect(getComputedStyle(cell(5)).outlineColor).toBe(colourOf("--focus"));
  expect(outline(4)).toBe("none");
  expect(getComputedStyle(grid.element()).outlineStyle).toBe("none");
});

test("shows at once, beside the cell the keyboard moves to, what the cell is, hidden from assistive technology", async () => {
  const { grid } = await renderGrid();
  await tabIntoGrid(grid);

  expect(shownTooltips()).toEqual(["Cell 1Fine"]);
  await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
  expect(shownTooltips()).toEqual(["Cell 5FineExample detail"]);
  const [tooltip] = shownTooltipElements();
  expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  const tip = tooltip?.getBoundingClientRect();
  const target = cell(5).getBoundingClientRect();
  expect(tip && tip.bottom <= target.top).toBe(true);
  expect(
    Math.abs(
      (tip ? (tip.left + tip.right) / 2 : 0) - (target.left + target.right) / 2,
    ),
  ).toBeLessThanOrEqual(1);
});

test("puts the tooltip away when the focus leaves the grid", async () => {
  const { grid } = await renderGrid();
  await tabIntoGrid(grid);

  await userEvent.tab();
  expect(shownTooltips()).toEqual([]);
});

// The same delay as every tooltip (Tooltip.tsx): a pointer that crosses
// the grid on its way somewhere does not light up every cell.
test("shows the tooltip of a cell the pointer rests on after a moment, and of the next one at once", async () => {
  await renderGrid();

  const start = performance.now();
  await userEvent.hover(cell(4));
  expect(shownTooltips()).toEqual([]);
  await expect.poll(shownTooltips).toEqual(["Cell 4Fine"]);
  // 300 ms, less what a slow engine takes between the move and the timer.
  expect(performance.now() - start).toBeGreaterThanOrEqual(250);
  await userEvent.hover(cell(6));
  expect(shownTooltips()).toEqual(["Cell 6Warning"]);
});

// When the page scrolls under a pointer that stands still, the browser
// tells the grid that the pointer is over another cell. The user's
// attention is not there, and a tooltip the keyboard brought up must stay.
test("gives the tooltip to no pointer that has not moved", async () => {
  const { grid } = await renderGrid();
  await userEvent.hover(cell(2));
  await expect.poll(shownTooltips).toEqual(["Cell 2Fine"]);
  await tabIntoGrid(grid);
  await userEvent.keyboard("{ArrowDown}");
  expect(shownTooltips()).toEqual(["Cell 11Fine"]);

  const place = cell(2).getBoundingClientRect();
  for (const type of ["pointerover", "pointermove"]) {
    cell(12).dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerType: "mouse",
        clientX: place.left + place.width / 2,
        clientY: place.top + place.height / 2,
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(shownTooltips()).toEqual(["Cell 11Fine"]);
});

test("gives the tooltip to whichever of the pointer and the keyboard moved last", async () => {
  const { grid } = await renderGrid();
  await tabIntoGrid(grid);
  expect(shownTooltips()).toEqual(["Cell 1Fine"]);

  await userEvent.hover(cell(8));
  await expect.poll(shownTooltips).toEqual(["Cell 8Fine"]);
  await userEvent.keyboard("{ArrowRight}");
  expect(shownTooltips()).toEqual(["Cell 2Fine"]);
});

// Escape is the tooltip's while it shows: a dialog or a drawer the grid
// lies in closes on the next press, not on this one (WCAG 2.1, success
// criterion 1.4.13).
test("puts the tooltip away on Escape, which then reaches nothing else", async () => {
  const { grid } = await renderGrid();
  await tabIntoGrid(grid);
  const reached = vi.fn();
  document.addEventListener("keydown", reached);
  try {
    await userEvent.keyboard("{Escape}");
    expect(shownTooltips()).toEqual([]);
    expect(reached).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(reached).toHaveBeenCalledTimes(1);
  } finally {
    document.removeEventListener("keydown", reached);
  }
  await userEvent.keyboard("{ArrowRight}");
  expect(shownTooltips()).toEqual(["Cell 2Fine"]);
});

test("keeps the tooltip while the pointer moves onto it, across the cells it lies over", async () => {
  await renderGrid();
  await userEvent.hover(cell(15));
  await expect.poll(shownTooltips).toEqual(["Cell 15Warning"]);

  // On the way up from cell 15 to its tooltip lies cell 5.
  const target = cell(15).getBoundingClientRect();
  const [tooltip] = shownTooltipElements();
  const tip = tooltip?.getBoundingClientRect();
  expect(
    tip &&
      tip.bottom <= target.top &&
      tip.bottom > cell(5).getBoundingClientRect().top,
  ).toBe(true);
  await userEvent.hover(cell(5), { position: { x: 5, y: 8 } });
  expect(shownTooltips()).toEqual(["Cell 15Warning"]);
  if (!tooltip) {
    throw new Error("no tooltip shows");
  }
  await userEvent.hover(tooltip);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(shownTooltips()).toEqual(["Cell 15Warning"]);

  await userEvent.hover(document.querySelector("p") as HTMLElement);
  await expect.poll(shownTooltips).toEqual([]);
});

// A finger does not rest: a touch shows what the cell is, and a second
// touch on the same cell presses it.
test("shows the tooltip on a touch, and presses the cell on a second touch", async () => {
  const pressed = vi.fn<(cell: GridCell) => void>();
  await renderGrid({ onActivate: pressed });
  const touch = (number: number) => {
    cell(number).dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
    );
    cell(number).click();
  };

  touch(9);
  await expect.poll(shownTooltips).toEqual(["Cell 9Warning"]);
  expect(pressed).not.toHaveBeenCalled();
  touch(9);
  expect(pressed.mock.calls.map(([{ label }]) => label)).toEqual(["Cell 9"]);

  // A finger that lifts leaves the cell, and the tooltip it showed stays.
  cell(4).dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
  );
  cell(4).click();
  // React reads a leave from the pointer going out to what it goes over.
  cell(4).dispatchEvent(
    new PointerEvent("pointerout", {
      bubbles: true,
      pointerType: "touch",
      relatedTarget: document.body,
    }),
  );
  // Longer than the pointer's grace before its tooltip goes.
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(shownTooltips()).toEqual(["Cell 4Fine"]);
  expect(pressed).toHaveBeenCalledTimes(1);

  document.body.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
  );
  await expect.poll(shownTooltips).toEqual([]);
});

test("puts the tooltip away when its cell goes, and keeps the focus on a cell that is there", async () => {
  const { screen, grid } = await renderGrid();
  await tabIntoGrid(grid);
  await userEvent.keyboard("{Control>}{End}{/Control}");
  expect(shownTooltips()).toEqual(["Cell 23Fine"]);

  await screen.rerender(
    <div className="m-16 flex flex-col gap-4">
      <p>Somewhere else</p>
      <button type="button">Before</button>
      <div className="w-[127px]">
        <CellGrid label="Example cells" cells={cellsOf(12)} tones={tones} />
      </div>
      <button type="button">After</button>
    </div>,
  );

  expect(shownTooltips()).toEqual([]);
  expect(focusedCell(grid.element())).toBe("Cell 12, Warning");
});

test("says so in words when it has no cells, and is then no grid", async () => {
  const screen = await render(
    <CellGrid
      label="Example"
      cells={[]}
      tones={tones}
      emptyText="No cells here."
    />,
  );

  await expect.element(screen.getByText("No cells here.")).toBeVisible();
  expect(screen.container.querySelector('[role="grid"]')).toBeNull();
});

test.for(["light", "dark"] as const)(
  "fills each cell with the text colour of its tone in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    await renderGrid();

    expect(getComputedStyle(cell(1)).backgroundColor).toBe(colourOf("--ok-fg"));
    expect(getComputedStyle(cell(3)).backgroundColor).toBe(
      colourOf("--warn-fg"),
    );
  },
);

test("draws every cell in the colour of text when the system forces its colours", async () => {
  await renderGrid();
  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  expect(getComputedStyle(cell(1)).backgroundColor).toBe(
    getComputedStyle(document.body).color,
  );
  expect(getComputedStyle(cell(3)).backgroundColor).toBe(
    getComputedStyle(cell(1)).backgroundColor,
  );
});
