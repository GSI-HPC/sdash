// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { Timeline, type TimelineRow } from "./Timeline";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

const now = new Date(2026, 0, 14, 12);
const from = new Date(2026, 0, 13);

const rows: readonly TimelineRow[] = [
  {
    id: "maint",
    label: "maintenance",
    detail: "worker-2",
    segments: [
      {
        label: "maintenance",
        start: new Date(2026, 0, 15),
        end: new Date(2026, 0, 16),
        tone: "warn",
      },
    ],
  },
  {
    id: "gone",
    label: "gone",
    segments: [
      {
        label: "gone",
        start: new Date(2025, 0, 1),
        end: new Date(2025, 0, 2),
        tone: "vio",
      },
    ],
  },
];

function renderTimeline() {
  return render(
    <Timeline
      label="Reservations over eight days, listed in the table below"
      from={from}
      days={8}
      now={now}
      rows={rows}
    />,
  );
}

// Where a stretch lies says when it is; that is no text a screen reader
// could follow, and the label sends it to the words.
test("is one image to assistive technology, named by its label", async () => {
  const screen = await renderTimeline();

  await expect
    .element(
      screen.getByRole("img", {
        name: "Reservations over eight days, listed in the table below",
      }),
    )
    .toBeVisible();
});

test("names the days, marks today, and draws a stretch where its times are", async () => {
  const screen = await renderTimeline();
  const image = screen.getByRole("img").element();

  const days = [
    ...image.querySelectorAll(":scope > div:first-child span.flex-1"),
  ];
  expect(days.map((day) => day.textContent)).toEqual([
    "Tue 13",
    "Wed 14",
    "Thu 15",
    "Fri 16",
    "Sat 17",
    "Sun 18",
    "Mon 19",
    "Tue 20",
  ]);
  expect(days[1]?.className).toContain("text-ac-t");

  const [first, second] = [...image.querySelectorAll("svg")];
  const stretch = first?.querySelector("rect[y]");
  expect(stretch?.getAttribute("x")).toBe("25%");
  expect(stretch?.getAttribute("width")).toBe("12.5%");
  // The other row's stretch lies before the window, and is not drawn.
  expect(second?.querySelector("rect[y]")).toBeNull();
});

test("draws the line of now where now is, on every row", async () => {
  const screen = await renderTimeline();
  const lines = [
    ...screen.getByRole("img").element().querySelectorAll("rect.fill-err-fg"),
  ];

  expect(lines).toHaveLength(2);
  expect(lines[0]?.getAttribute("x")).toBe("18.75%");
});
