// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the component tests of the shell share: the whole application
// rendered at an address, with a function in place of the server. Nothing
// here is part of the application; only tests import it
// (doc/adr/0015-how-tests-are-written.md).

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { MemoryRouter, useNavigate } from "react-router";
import { vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { App } from "../App";
import { createQueryClient } from "../client/query";
import { isApplePlatform } from "../shortcuts/keys";

/** What the status operation answers in these tests. */
export const status = {
  version: "v1.4.0",
  goVersion: "go1.27.1",
  platform: "linux/arm64",
  readOnly: false,
  clusters: [],
};

/**
 * Two buttons that stand in for the browser's Back and Forward. The
 * application is rendered with its history in memory, which the browser's
 * own buttons do not reach; the end-to-end tests press the real ones.
 */
function HistoryButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => void navigate(-1)}>
        Test: back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Test: forward
      </button>
    </>
  );
}

/**
 * Renders the application as a page that was opened at the given address,
 * with a store of its own and a server that answers the status operation.
 */
export function renderApp(address = "/") {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  return render(
    // In strict mode, as main.tsx mounts the application: React then runs
    // every effect twice while developing, and a registration that does
    // not undo itself cleanly shows here and not only on a developer's
    // screen.
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[address]}>
          {/*
            As high as the window, which is what the element of index.html
            that the application is mounted in gives it: the shell fills
            its parent, and only then is there a main region that scrolls.
          */}
          <div className="h-screen">
            <App />
          </div>
          <HistoryButtons />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/**
 * Puts the page back to how a first visit finds it. Call it before each
 * test: the tests of a file share one page, and with it the stored
 * preferences, the theme, the title and the size of the window.
 */
export function resetPage(): void {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.title = "";
}

/**
 * Presses the palette's shortcut with the modifier of the machine the test
 * runs on, as the application reads it: Command on a Mac, Control
 * elsewhere.
 */
export async function pressModK(): Promise<void> {
  const modifier = isApplePlatform(navigator.platform) ? "Meta" : "Control";
  await userEvent.keyboard(`{${modifier}>}k{/${modifier}}`);
}

/**
 * The width of the sidebar, in CSS pixels. The sidebar is the navigation
 * landmark of the page.
 */
export function sidebarWidth(): number {
  const sidebar = page.getByRole("navigation", { name: "Views" }).query();
  return sidebar ? sidebar.getBoundingClientRect().width : NaN;
}

/** The element that has the focus, for an assertion on where it went. */
export function focused(): Element | null {
  return document.activeElement;
}

/**
 * Waits until the page has acted on what just happened: React runs its
 * effects after the browser has painted, and a scroll is reported with the
 * next frame. A test awaits this before it asserts that something did not
 * happen, which is otherwise true of any page that has not got to it yet.
 */
export async function settled(): Promise<void> {
  for (let frame = 0; frame < 2; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  await new Promise((resolve) => setTimeout(resolve));
}
