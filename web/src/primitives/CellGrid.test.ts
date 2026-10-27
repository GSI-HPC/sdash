// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { columnsIn, moveFrom } from "./CellGrid";

// Cells are 10 px wide and 3 px apart: n cells take 13n - 3 px.
test("as many cells fit side by side as the width holds with the gaps between", () => {
  expect(columnsIn(127)).toBe(10);
  expect(columnsIn(126)).toBe(9);
  expect(columnsIn(10)).toBe(1);
});

test("a grid narrower than a cell still has one column", () => {
  expect(columnsIn(0)).toBe(1);
  expect(columnsIn(4)).toBe(1);
});

describe("the keyboard, in 23 cells of 10 to a row", () => {
  const move = (from: number, key: string, ctrlKey = false) =>
    moveFrom(from, 23, 10, { key, ctrlKey });

  test("the arrow keys move by a cell and by a row", () => {
    expect(move(12, "ArrowRight")).toBe(13);
    expect(move(12, "ArrowLeft")).toBe(11);
    expect(move(12, "ArrowDown")).toBe(22);
    expect(move(12, "ArrowUp")).toBe(2);
  });

  // The arrows stop at the edges: past the end of a row they go on in the
  // next, as the cells are one sequence, but never past the first or the
  // last cell, and never down into a place of the last row with no cell.
  test("the arrow keys stop at the first and the last cell", () => {
    expect(move(0, "ArrowLeft")).toBe(0);
    expect(move(22, "ArrowRight")).toBe(22);
    expect(move(9, "ArrowRight")).toBe(10);
    expect(move(5, "ArrowUp")).toBe(5);
    expect(move(15, "ArrowDown")).toBe(15);
  });

  test("Home and End go to the ends of the row, with Control to the first and the last cell", () => {
    expect(move(14, "Home")).toBe(10);
    expect(move(14, "End")).toBe(19);
    expect(move(21, "End")).toBe(22);
    expect(move(14, "Home", true)).toBe(0);
    expect(move(4, "End", true)).toBe(22);
  });

  test("a key the grid does not take, or an arrow with Control, moves nothing", () => {
    expect(move(4, "a")).toBeNull();
    expect(move(4, "PageDown")).toBeNull();
    expect(move(4, "ArrowRight", true)).toBeNull();
  });
});
