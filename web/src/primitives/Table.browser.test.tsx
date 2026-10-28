// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { settled } from "../testing/app";
import { Table, type TableColumn, type TableSort } from "./Table";

interface Item {
  readonly name: string;
  readonly count: number;
}

const items: readonly Item[] = [
  { name: "First item", count: 3 },
  { name: "Second item", count: 12 },
];

const columns: readonly TableColumn<Item>[] = [
  { id: "name", header: "Name", cell: (item) => item.name, sortable: true },
  {
    id: "count",
    header: "Count",
    cell: (item) => String(item.count),
    align: "end",
    mono: true,
    sortable: true,
    firstOrder: "desc",
  },
  { id: "note", header: "Note", cell: () => "Some words" },
];

/** A table whose caller keeps the sort, and tells the test of each. */
function Sorted({ onSort }: { onSort: (sort: TableSort) => void }) {
  const [sort, setSort] = useState<TableSort>({ column: "name", order: "asc" });
  return (
    <Table
      label="Made-up items"
      columns={columns}
      rows={items}
      rowKey={(item) => item.name}
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        onSort(next);
      }}
    />
  );
}

// Assistive technology reads a cell with the header of its column only
// where the header is a header cell of that column.
test("is a table named by its label, whose header cells name their columns", async () => {
  const screen = await render(
    <Table
      label="Made-up items"
      columns={columns}
      rows={items}
      rowKey={(item) => item.name}
    />,
  );
  const table = screen.getByRole("table", { name: "Made-up items" });

  await expect.element(table).toBeVisible();
  const headers = [...table.element().querySelectorAll("th")];
  expect(headers.map((th) => th.textContent)).toEqual([
    "Name",
    "Count",
    "Note",
  ]);
  expect(headers.every((th) => th.getAttribute("scope") === "col")).toBe(true);
  expect(
    [...table.element().querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent),
    ),
  ).toEqual([
    ["First item", "3", "Some words"],
    ["Second item", "12", "Some words"],
  ]);
});

test("says by aria-sort which column it is sorted by and in which direction", async () => {
  const screen = await render(<Sorted onSort={() => undefined} />);
  const header = (name: string) =>
    screen.getByRole("columnheader", { name }).element();

  expect(header("Name").getAttribute("aria-sort")).toBe("ascending");
  expect(header("Count").hasAttribute("aria-sort")).toBe(false);
  expect(header("Note").hasAttribute("aria-sort")).toBe(false);
});

// The first press sorts by a column in its own first direction, and the
// next turns it round.
test("sorts by a column when its header is pressed, and turns the direction round on the next press", async () => {
  const sorts: TableSort[] = [];
  const screen = await render(<Sorted onSort={(sort) => sorts.push(sort)} />);

  await screen.getByRole("button", { name: "Count" }).click();
  await screen.getByRole("button", { name: "Count" }).click();
  await screen.getByRole("button", { name: "Name" }).click();

  expect(sorts).toEqual([
    { column: "count", order: "desc" },
    { column: "count", order: "asc" },
    { column: "name", order: "asc" },
  ]);
  expect(
    screen
      .getByRole("columnheader", { name: "Name" })
      .element()
      .getAttribute("aria-sort"),
  ).toBe("ascending");
});

test("is sorted by the keyboard alone: Tab reaches each header that sorts, and Enter and Space press it", async () => {
  const sorts: TableSort[] = [];
  const screen = await render(<Sorted onSort={(sort) => sorts.push(sort)} />);

  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Name" }).element(),
  );
  await userEvent.keyboard("{Enter}");
  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Count" }).element(),
  );
  await userEvent.keyboard(" ");

  expect(sorts).toEqual([
    { column: "name", order: "desc" },
    { column: "count", order: "desc" },
  ]);
});

test("has no button in the header of a column that does not sort", async () => {
  const screen = await render(<Sorted onSort={() => undefined} />);

  expect(
    screen
      .getByRole("columnheader", { name: "Note" })
      .element()
      .querySelector("button"),
  ).toBeNull();
});

// A table wider than its box scrolls inside it, and a keyboard user has to
// be able to get there to scroll it.
test("scrolls sideways inside its box where it is wider, and is then a stop of the Tab key with a name", async () => {
  const screen = await render(
    <div className="w-40">
      <Table
        label="Made-up items"
        columns={columns}
        rows={items}
        rowKey={(item) => item.name}
      />
    </div>,
  );
  await settled();
  const box = screen.getByRole("region", { name: "Made-up items" }).element();

  expect(box.getBoundingClientRect().width).toBe(160);
  expect(box.scrollWidth).toBeGreaterThan(160);
  expect(box.tabIndex).toBe(0);
});

test("sets a figure at the end of its cell and in DM Mono", async () => {
  const screen = await render(
    <Table
      label="Made-up items"
      columns={columns}
      rows={items}
      rowKey={(item) => item.name}
    />,
  );
  const cell = screen.getByRole("cell", { name: "12" }).element();

  expect(getComputedStyle(cell).textAlign).toBe("right");
  expect(getComputedStyle(cell).fontFamily).toContain("DM Mono");
});
