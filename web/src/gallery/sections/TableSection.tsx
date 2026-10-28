// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Badge } from "../../primitives/Badge";
import { Card } from "../../primitives/Card";
import {
  Table,
  type TableColumn,
  type TableSort,
} from "../../primitives/Table";
import { Example, Section } from "../Section";

/** A made-up row. */
interface Item {
  readonly name: string;
  readonly kind: string;
  readonly fine: boolean;
  readonly count: number;
  readonly path: string;
}

const items: readonly Item[] = [
  {
    name: "First item",
    kind: "Round",
    fine: true,
    count: 12,
    path: "/example/a",
  },
  {
    name: "Second item",
    kind: "Square",
    fine: false,
    count: 3,
    path: "/example/b",
  },
  {
    name: "Third item",
    kind: "Round",
    fine: true,
    count: 1024,
    path: "/example/of/a/longer/path",
  },
  {
    name: "Fourth item",
    kind: "Flat",
    fine: true,
    count: 0,
    path: "/example/d",
  },
];

const columns: readonly TableColumn<Item>[] = [
  { id: "name", header: "Name", cell: (item) => item.name, sortable: true },
  { id: "kind", header: "Kind", cell: (item) => item.kind, sortable: true },
  {
    id: "state",
    header: "State",
    cell: (item) => (
      <Badge tone={item.fine ? "ok" : "warn"} size="sm" dot>
        {item.fine ? "Fine" : "Waiting"}
      </Badge>
    ),
  },
  {
    id: "count",
    header: "Count",
    cell: (item) => item.count.toLocaleString("en-GB"),
    align: "end",
    mono: true,
    sortable: true,
    firstOrder: "desc",
  },
  { id: "path", header: "Path", cell: (item) => item.path, mono: true },
];

/** The items in the order of a sort, as the caller of a table sorts them. */
function sorted(sort: TableSort): readonly Item[] {
  const key = sort.column as "name" | "kind" | "count";
  const order = sort.order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const [x, y] = [a[key], b[key]];
    return (
      order *
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y)))
    );
  });
}

/** A sortable table in a card, one that scrolls sideways, and one without sorting. */
export function TableSection() {
  const [sort, setSort] = useState<TableSort>({
    column: "name",
    order: "asc",
  });

  return (
    <Section id="table">
      <Example title="Sortable by name, kind and count, in a card that runs to its edges">
        <Card flush className="w-full">
          <Table
            label="Made-up items"
            columns={columns}
            rows={sorted(sort)}
            rowKey={(item) => item.name}
            sort={sort}
            onSortChange={setSort}
          />
        </Card>
      </Example>
      <Example title="Narrower than its columns: it scrolls sideways">
        <Card flush className="w-60">
          <Table
            label="Made-up items in a narrow card"
            columns={columns}
            rows={items}
            rowKey={(item) => item.name}
          />
        </Card>
      </Example>
    </Section>
  );
}
