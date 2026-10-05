// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import { PageHeader } from "../layout/PageHeader";
import { settled } from "../testing/app";
import { ArrivalProvider } from "./arrival";
import { defineSearchParam, integer, oneOf, setTo } from "./searchParams";
import { useSearchChanges, useSearchParam } from "./useSearchParam";

const state = defineSearchParam(
  "state",
  oneOf(["all", "running", "pending"]),
  "all",
);
const job = defineSearchParam("job", integer, 0);

/**
 * A view with a filter and a drawer in the address, as the first real view
 * will have them. No view uses the hook yet, so this one stands in.
 */
function Filtered() {
  const [filter, setFilter] = useSearchParam(state);
  const [open, setOpen] = useSearchParam(job);
  const changeSearch = useSearchChanges();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <output aria-label="Address">{pathname + search}</output>
      <output aria-label="Filter">{filter}</output>
      <output aria-label="Drawer">{open}</output>
      <button
        type="button"
        onClick={() => {
          setFilter("running");
        }}
      >
        Running
      </button>
      <button
        type="button"
        onClick={() => {
          setFilter("all");
        }}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(4711, { history: "push" });
        }}
      >
        Open job
      </button>
      <button
        type="button"
        onClick={() => {
          changeSearch([setTo(state, "pending"), setTo(job, 7)], {
            history: "push",
          });
        }}
      >
        Pending, job 7
      </button>
      <button
        type="button"
        onClick={() => {
          changeSearch([setTo(state, "all"), setTo(job, 0)]);
        }}
      >
        Reset
      </button>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
    </>
  );
}

function renderAt(...addresses: string[]) {
  return render(
    <MemoryRouter initialEntries={addresses}>
      <Filtered />
    </MemoryRouter>,
  );
}

// A link someone was sent, or a reload: the address is all there is.
test("a view opened at an address shows the state the address names", async () => {
  const screen = await renderAt("/jobs?state=pending&job=12");

  await expect
    .element(screen.getByLabelText("Filter"))
    .toHaveTextContent("pending");
  await expect.element(screen.getByLabelText("Drawer")).toHaveTextContent("12");
});

test("an address that names nothing, or nonsense, shows the fallback", async () => {
  const screen = await renderAt("/jobs?state=exploded&job=first");

  await expect
    .element(screen.getByLabelText("Filter"))
    .toHaveTextContent("all");
  await expect.element(screen.getByLabelText("Drawer")).toHaveTextContent("0");
});

test("setting a parameter changes the address and keeps the others", async () => {
  const screen = await renderAt("/jobs?job=12");

  await screen.getByRole("button", { name: "Running" }).click();

  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/jobs?job=12&state=running");
  await expect
    .element(screen.getByLabelText("Filter"))
    .toHaveTextContent("running");

  // Back at its fallback, the parameter leaves the address.
  await screen.getByRole("button", { name: "All" }).click();
  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/jobs?job=12");
});

// A filter replaces the current entry of the history: Back leaves the
// view and does not walk through every state the filter had.
test("a parameter set without more replaces the entry in the history", async () => {
  const screen = await renderAt("/overview", "/jobs");

  await screen.getByRole("button", { name: "Running" }).click();
  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/jobs?state=running");
  await screen.getByRole("button", { name: "Back" }).click();

  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/overview");
});

// A drawer adds an entry: Back closes it, as a user expects of something
// that opened over the page.
test("a parameter set with push adds an entry, which Back takes away again", async () => {
  const screen = await renderAt("/overview", "/jobs?state=running");

  await screen.getByRole("button", { name: "Open job" }).click();
  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/jobs?state=running&job=4711");
  await screen.getByRole("button", { name: "Back" }).click();

  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/jobs?state=running");
  await expect.element(screen.getByLabelText("Drawer")).toHaveTextContent("0");
});

// A control that changes two parameters, a filter that also closes the
// drawer, say, makes one navigation of it. Two would be two entries in the
// history, and the router would make the second from the address before
// the first, which undoes it.
test("two parameters set in one event arrive in the address together, as one entry", async () => {
  const screen = await renderAt("/overview", "/jobs?job=12");
  const address = screen.getByLabelText("Address");

  await screen.getByRole("button", { name: "Pending, job 7" }).click();

  await expect.element(address).toHaveTextContent("/jobs?job=7&state=pending");
  await expect
    .element(screen.getByLabelText("Filter"))
    .toHaveTextContent("pending");
  await expect.element(screen.getByLabelText("Drawer")).toHaveTextContent("7");

  // One entry was added: Back is at the address before both.
  await screen.getByRole("button", { name: "Back" }).click();
  await expect.element(address).toHaveTextContent("/jobs?job=12");
});

test("two parameters set to their fallbacks in one event both leave the address", async () => {
  const screen = await renderAt("/jobs?state=running&job=12&q=gpu");

  await screen.getByRole("button", { name: "Reset" }).click();

  await expect
    .element(screen.getByLabelText("Address"))
    .toHaveTextContent("/jobs?q=gpu");
});

// Arriving at a view moves the focus to its heading (arrival.tsx). A
// filter changes the address too, and is no arrival: the focus has to stay
// on the control the user is working, or every change of a filter would
// throw a keyboard user back to the top of the view.
test("a change of the query string leaves the focus on the control that made it", async () => {
  const screen = await render(
    <MemoryRouter initialEntries={["/overview", "/jobs"]}>
      <ArrivalProvider>
        <PageHeader title="Jobs" summary="The queue." />
        <Filtered />
      </ArrivalProvider>
    </MemoryRouter>,
  );
  const address = screen.getByLabelText("Address");

  // Replacing the entry, as a filter does.
  const running = screen.getByRole("button", { name: "Running" });
  await running.click();
  await expect.element(address).toHaveTextContent("/jobs?state=running");
  await settled();
  await expect.element(running).toHaveFocus();

  // Adding one, as a drawer does.
  const open = screen.getByRole("button", { name: "Open job" });
  await open.click();
  await expect
    .element(address)
    .toHaveTextContent("/jobs?state=running&job=4711");
  await settled();
  await expect.element(open).toHaveFocus();
});
