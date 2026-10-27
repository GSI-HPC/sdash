// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { KVList } from "./KVList";

const items = [
  { term: "First term", value: "example-17" },
  { term: "Second term", value: "Some words", mono: false },
];

// Assistive technology reads a description list as terms, each with its
// value; a list of rows of two texts would be read as text alone.
test("is a description list, each term followed by its value", async () => {
  const screen = await render(<KVList items={items} />);
  const list = screen.container.querySelector("dl");

  expect(
    [...(list?.querySelectorAll("dt, dd") ?? [])].map(
      (element) => `${element.tagName}:${element.textContent}`,
    ),
  ).toEqual([
    "DT:First term",
    "DD:example-17",
    "DT:Second term",
    "DD:Some words",
  ]);
});

test("sets a value in the monospaced font unless it is said to be words", async () => {
  const screen = await render(<KVList items={items} />);
  const font = (text: string) =>
    getComputedStyle(screen.getByText(text).element()).fontFamily;

  expect(font("example-17")).toContain("DM Mono");
  expect(font("Some words")).not.toContain("DM Mono");
});

test("puts the term at the start of its line and the value at the end", async () => {
  const screen = await render(
    <div className="w-80">
      <KVList items={items} />
    </div>,
  );
  const box = (text: string) =>
    screen.getByText(text).element().getBoundingClientRect();
  const list = screen.container.querySelector("dl")?.getBoundingClientRect();

  expect(box("First term").left).toBe(list?.left);
  expect(Math.abs(box("example-17").right - (list?.right ?? 0))).toBeLessThan(
    1,
  );
  expect(Math.abs(box("example-17").top - box("First term").top)).toBeLessThan(
    4,
  );
});

// An id or a path has no space to break at. In a narrow drawer it has to
// break all the same, or the drawer scrolls sideways.
test("breaks a value that does not fit, also inside a word, and stays as wide as its column", async () => {
  const screen = await render(
    <div className="w-50">
      <KVList
        items={[
          {
            term: "Path",
            value: "/example/of/a/path/that/is/longer/than/the/column",
          },
        ]}
      />
    </div>,
  );
  const list = screen.container.querySelector("dl");

  expect(list?.getBoundingClientRect().width).toBe(200);
  expect(list?.scrollWidth).toBeLessThanOrEqual(200);
  expect(
    screen
      .getByText(/^\/example/)
      .element()
      .getBoundingClientRect().height,
  ).toBeGreaterThan(20);
});
