// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { ViewBoundary } from "./ViewBoundary";

// What the boundary shows of a view that failed. That the report takes
// the focus and names the document when the user arrives at such a view
// is in arrival.browser.test.tsx.

/**
 * The boundary where the application has it, inside a router: the heading
 * of its report asks the router for the address.
 */
function at(address: string, view: ReactNode) {
  return (
    <MemoryRouter initialEntries={[address]}>
      <ViewBoundary at={address}>{view}</ViewBoundary>
    </MemoryRouter>
  );
}

/**
 * A view whose file cannot be fetched: what the browser reports when sdash
 * was stopped or replaced after the page was opened.
 */
function Broken(): never {
  throw new TypeError("Failed to fetch dynamically imported module");
}

// Without the boundary a view that cannot be loaded would take the whole
// page with it, navigation included. With it the user is told what most
// likely happened, in words and as an alert, and how to get out of it.
test("a view that fails is reported as an alert with a way out", async () => {
  const screen = await render(at("/nodes", <Broken />));

  const alert = screen.getByRole("alert");
  await expect
    .element(alert.getByRole("heading", { level: 1 }))
    .toHaveTextContent("This view did not load");
  await expect.element(alert).toMatchTextContent(/Reload the page/);
  await expect.element(alert).not.toMatchTextContent(/Failed to fetch/);
  await expect
    .element(alert.getByRole("button", { name: "Reload" }))
    .toBeVisible();
  expect(document.title).toBe("This view did not load - sdash");
});

// A view that was loaded and then broke has another cause, a defect in
// the view, and the user is not told that sdash was stopped.
test("a view that fails while it is drawn is reported as that", async () => {
  function Faulty(): never {
    throw new TypeError("Cannot read properties of undefined");
  }
  const screen = await render(at("/nodes", <Faulty />));

  const alert = screen.getByRole("alert");
  await expect
    .element(alert.getByRole("heading", { level: 1 }))
    .toHaveTextContent("This view failed");
  await expect.element(alert).not.toMatchTextContent(/stopped|replaced/);
  await expect.element(alert).not.toMatchTextContent(/Cannot read/);
  await expect
    .element(alert.getByRole("button", { name: "Reload" }))
    .toBeVisible();
  expect(document.title).toBe("This view failed - sdash");
});

// The views that were loaded before still work. Going to one of them has
// to show it, and not the report of the one that failed.
test("another address shows its view and not the report", async () => {
  const screen = await render(at("/nodes", <Broken />));
  await expect.element(screen.getByRole("alert")).toBeVisible();

  await screen.rerender(at("/jobs", <h1>Jobs</h1>));

  await expect
    .element(screen.getByRole("heading", { level: 1 }))
    .toHaveTextContent("Jobs");
  expect(screen.getByRole("alert").elements()).toHaveLength(0);
});
