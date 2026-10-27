// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { askForLessMotion } from "../testing/system";
import { Skeleton } from "./Skeleton";

// The word is the skeleton, for everyone: the grey lines say nothing a
// screen reader could read, so it is told the word and not the lines.
test("is a status that says in words what is on its way, with its lines hidden", async () => {
  const screen = await render(<Skeleton label="Loading the example" />);

  const status = screen.getByRole("status");
  await expect.element(status).toHaveTextContent("Loading the example…");
  await expect.element(screen.getByText("Loading the example…")).toBeVisible();
  const lines = status.element().querySelector('[aria-hidden="true"]');
  expect(lines?.children).toHaveLength(3);
  expect(lines?.textContent).toBe("");
});

test('says "Loading" unless it is told what is on its way', async () => {
  const screen = await render(<Skeleton />);

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Loading…");
});

test("draws as many lines as it is asked for, and at least one", async () => {
  const screen = await render(
    <>
      <Skeleton label="Five" lines={5} />
      <Skeleton label="None" lines={0} />
      <Skeleton label="No number" lines={Number.NaN} />
    </>,
  );
  const count = (label: string) =>
    screen
      .getByText(`${label}…`)
      .element()
      .parentElement?.querySelector('[aria-hidden="true"]')?.children.length;

  expect(count("Five")).toBe(5);
  expect(count("None")).toBe(1);
  expect(count("No number")).toBe(1);
});

// Nothing moves: there is no motion to take back for whoever asks for less.
test("does not move, whether less motion is asked for or not", async () => {
  try {
    for (const asked of [false, true]) {
      await askForLessMotion(asked);
      const screen = await render(<Skeleton />);
      for (const element of screen.container.querySelectorAll("*")) {
        expect(getComputedStyle(element).animationName).toBe("none");
      }
      await screen.unmount();
    }
  } finally {
    await askForLessMotion(false);
  }
});
