// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { createQueryClient } from "../client/query";
import { StatusSummary } from "./StatusSummary";

const status = {
  version: "v1.4.0",
  goVersion: "go1.27.1",
  platform: "linux/arm64",
  readOnly: false,
  clusters: [],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Puts a function in the place of the browser's fetch for one test, where
 * it stands in for the server, and returns the addresses it was asked for.
 */
function serverAnswers(respond: () => Promise<Response>): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    asked.push(input instanceof Request ? input.url : input.toString());
    return respond();
  });
  return asked;
}

/** Renders the summary with a store of its own, as a fresh page has. */
function renderSummary() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <StatusSummary />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

test("the version and the platform of the server are shown", async () => {
  const asked = serverAnswers(() => Promise.resolve(json(200, status)));

  const screen = await renderSummary();

  const region = screen.getByRole("region", { name: "About" });
  await expect.element(region.getByText("v1.4.0")).toBeVisible();
  await expect.element(region.getByText("linux/arm64")).toBeVisible();
  expect(asked).toEqual(["/api/v1/status"]);
});

// sdash is on the loopback address, which needs no network. A laptop that
// lost its Wi-Fi must still be told what its own sdash answers, where the
// query library by default waits for the network to come back.
test("the server is asked while the browser reports itself offline", async () => {
  onlineManager.setOnline(false);
  const asked = serverAnswers(() => Promise.resolve(json(200, status)));

  const screen = await renderSummary();

  await expect.element(screen.getByText("v1.4.0")).toBeVisible();
  expect(asked).toEqual(["/api/v1/status"]);
});

// A screen reader announces what changes inside a status region. The region
// that says "loading" is the one the answer then appears in, so the answer
// is announced without the user having to look for it
// (doc/adr/0014-accessibility-and-browsers.md).
test("the wait and then the answer are told in one status region", async () => {
  let arrive: (response: Response) => void = () => undefined;
  serverAnswers(
    () =>
      new Promise((resolve) => {
        arrive = resolve;
      }),
  );

  const screen = await renderSummary();
  const live = screen.getByRole("status");

  await expect.element(live).toHaveTextContent("Loading the version of sdash…");
  const whileWaiting = live.element();
  expect(screen.getByRole("alert").elements()).toHaveLength(0);

  arrive(json(200, status));

  await expect.element(live.getByText("v1.4.0")).toBeVisible();
  await expect.element(live).not.toMatchTextContent(/Loading/);
  expect(live.element()).toBe(whileWaiting);
});

// The server's reason is written for the user: for a tab left open across
// a restart it says how to get back in.
test("a refusal by the server is announced as an alert with its reason", async () => {
  serverAnswers(() =>
    Promise.resolve(
      json(401, {
        code: "not_signed_in",
        message:
          "not signed in; open the address sdash printed when it started",
      }),
    ),
  );

  const screen = await renderSummary();

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(
      "sdash did not report its version: not signed in; open the address sdash printed when it started",
    );
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();
});

// What fetch rejects with when nothing answers differs between browsers
// and tells a user nothing, so the page says in its own words what has
// most likely happened.
test("a server that does not answer is announced as an alert that says so", async () => {
  serverAnswers(() => Promise.reject(new TypeError("Failed to fetch")));

  const screen = await renderSummary();

  const alert = screen.getByRole("alert");
  await expect.element(alert).toMatchTextContent(/^sdash does not answer\./);
  await expect.element(alert).not.toMatchTextContent(/Failed to fetch/);
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();
});
