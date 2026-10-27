// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { ErrorPanel } from "./ErrorPanel";

test("says what failed, what to do and the error itself, with the dot hidden", async () => {
  const screen = await render(
    <ErrorPanel title="The example did not load." code="Example error 17">
      Try again later.
    </ErrorPanel>,
  );

  for (const text of [
    "The example did not load.",
    "Try again later.",
    "Example error 17",
  ]) {
    await expect.element(screen.getByText(text)).toBeVisible();
  }
  expect(
    getComputedStyle(screen.getByText("Example error 17").element()).fontFamily,
  ).toContain("DM Mono");
  const dot = screen.container.querySelector('[aria-hidden="true"]');
  expect(dot?.textContent).toBe("");
});

test("tries again when its button is pressed by the keyboard", async () => {
  const retry = vi.fn();
  const screen = await render(
    <ErrorPanel
      title="Example failure"
      onRetry={retry}
      retryLabel="Try again"
    />,
  );

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Try again" }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(retry).toHaveBeenCalledTimes(1);
});

test("has no button when nothing can be tried again", async () => {
  const screen = await render(<ErrorPanel title="Example failure" />);

  expect(screen.container.querySelector("button")).toBeNull();
});

// An alert is read the moment it appears, before anything else: right for
// a failure after the page showed, wrong for one that is there on arrival.
test("is an alert only when it is asked to be one", async () => {
  const screen = await render(
    <>
      <ErrorPanel title="Quiet failure" />
      <ErrorPanel title="Loud failure" alert />
    </>,
  );

  const alerts = screen.getByRole("alert").elements();
  expect(alerts).toHaveLength(1);
  expect(alerts[0]?.textContent).toContain("Loud failure");
});

test("is a heading only when it is given a level", async () => {
  const screen = await render(
    <>
      <ErrorPanel title="Without a level" />
      <ErrorPanel title="With a level" level={3} />
    </>,
  );

  expect(screen.getByText("Without a level").element().tagName).toBe("P");
  await expect
    .element(screen.getByRole("heading", { level: 3, name: "With a level" }))
    .toBeVisible();
});
