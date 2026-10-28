// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useRef } from "react";

import { Icon } from "../icons/Icon";
import { useKeyboardScroll } from "../layout/useKeyboardScroll";
import { cx } from "./classes";

/** The direction of a sort. */
export type SortOrder = "asc" | "desc";

/** Which column a table is sorted by, and in which direction. */
export interface TableSort {
  readonly column: string;
  readonly order: SortOrder;
}

/** One column of a table. */
export interface TableColumn<Row> {
  /** The name the code knows the column by, and what a sort names. */
  readonly id: string;
  /** The text of the header cell, which names the column. */
  readonly header: string;
  /** What the column shows of a row. */
  readonly cell: (row: Row) => ReactNode;
  /** "end" for figures, which line up at their last digit; "start" otherwise. */
  readonly align?: "start" | "end";
  /**
   * In DM Mono, for an id, a path or figures that have to line up: the
   * figures of DM Sans are not all of one width.
   */
  readonly mono?: boolean;
  /** Whether the header sorts by the column when pressed. */
  readonly sortable?: boolean;
  /**
   * The direction a first press sorts in; "asc" unless said otherwise.
   * "desc" suits a column where the largest comes first to mind, a
   * priority, a count.
   */
  readonly firstOrder?: SortOrder;
}

/** The props of a table. */
export interface TableProps<Row> {
  /** The name of the table, which assistive technology reads with it. */
  label: string;
  /** The columns, in the order they stand in. */
  columns: readonly TableColumn<Row>[];
  /** The rows, in the order they stand in: a table sorts nothing itself. */
  rows: readonly Row[];
  /** A key of each row that no other row of the table has. */
  rowKey: (row: Row) => string;
  /** The column the rows are sorted by, which the header says. */
  sort?: TableSort;
  /**
   * Called with the sort the user asked for by pressing a header. The
   * caller sorts, or asks the server to, and hands the new rows in.
   */
  onSortChange?: (sort: TableSort) => void;
  /** Classes for the layout around the table, never for its look. */
  className?: string;
}

// The handoff's paddings: 12 px between columns, 14 px at the edges of the
// table, where the first and the last column meet the card.
const cellPadding = "px-3 first:pl-3.5 last:pr-3.5";

/**
 * Rows of data in columns, as the handoff draws its dense tables, in a
 * native table: a header cell names each column for every cell below it,
 * which assistive technology reads with the cell (WCAG 2.1, success
 * criterion 1.3.1).
 *
 * A sortable column has a button in its header cell, which the Tab key
 * stops on and Enter and Space press. The header cell of the column the
 * rows are sorted by says so with aria-sort and an arrow; one press sorts
 * by a column in its first direction, the next turns the direction round.
 * The table sorts nothing itself: what it shows is what it is given, so
 * that a list the server sorts and cuts into pages works the same as one
 * held whole.
 *
 * The table is as wide as its container and as its content needs. Where
 * that is wider, as on a narrow window, it scrolls sideways inside its own
 * box, which the Tab key then stops on so that the keyboard scrolls it
 * too.
 *
 * A table lies in a card that runs to its edges (Card's `flush`): the
 * header's --t3, as the handoff has it, reaches 4.5:1 on a card and not on
 * the page.
 */
export function Table<Row>({
  label,
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  className,
}: TableProps<Row>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  useKeyboardScroll(containerRef, tableRef, {
    role: "region",
    "aria-label": label,
  });

  function press(column: TableColumn<Row>) {
    const sorted = sort?.column === column.id;
    const order: SortOrder = sorted
      ? sort.order === "asc"
        ? "desc"
        : "asc"
      : (column.firstOrder ?? "asc");
    onSortChange?.({ column: column.id, order });
  }

  return (
    // Positioned, to hold the caption that is left to assistive
    // technology: it is taken out of the flow, and would otherwise make
    // the page and not this box larger.
    <div
      ref={containerRef}
      className={cx("relative max-w-full overflow-x-auto", className)}
    >
      <table
        ref={tableRef}
        className="w-full border-separate border-spacing-0 text-[0.78125rem]"
      >
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.column === column.id ? sort.order : null;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    sorted === null
                      ? undefined
                      : sorted === "asc"
                        ? "ascending"
                        : "descending"
                  }
                  className={cx(
                    "border-b border-bd py-2.25 text-[0.71875rem] font-medium whitespace-nowrap text-t3",
                    cellPadding,
                    column.align === "end" ? "text-right" : "text-left",
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => {
                        press(column);
                      }}
                      className={cx(
                        "inline-flex cursor-pointer items-center gap-1 rounded-xs font-medium hover:text-t1",
                        sorted !== null && "text-t1",
                        column.align === "end" && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      {/*
                        The arrow repeats what aria-sort says, and keeps
                        its room while it is not shown, so that the
                        header does not move when the sort does.
                      */}
                      <Icon
                        name="chevronDown"
                        className={cx(
                          "size-3 stroke-2",
                          sorted === null && "invisible",
                          sorted === "asc" && "rotate-180",
                        )}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        {/* The last row's line would lie on the border of the card. */}
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cx(
                    "border-b border-bds py-2 whitespace-nowrap",
                    cellPadding,
                    column.align === "end" && "text-right",
                    column.mono && "font-mono text-xs",
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
