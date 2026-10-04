// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { StatusSummary } from "./status/StatusSummary";
import { ThemeToggle } from "./theme/ThemeToggle";

/**
 * The application shell: the header with the mark, the name and the theme
 * toggle, and the main region, which says which sdash is running. It shows
 * no cluster data yet; the views arrive with the backend that serves them
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 *
 * The fixed text does not say that sdash runs: whether it answers is what
 * the status summary finds out, and the two must not contradict each other
 * when it does not.
 */
export function App() {
  return (
    <div className="flex min-h-full flex-col text-[0.8125rem]">
      <header className="sticky top-0 flex h-13 shrink-0 items-center justify-between gap-3 border-b border-bd bg-base pr-3.5 pl-4">
        <div className="flex items-center gap-2.25">
          <Mark />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
            sdash
          </span>
        </div>
        <ThemeToggle />
      </header>
      <main className="px-6 pt-5 pb-12">
        <h1 className="text-xl font-semibold">No cluster configured</h1>
        <p className="mt-1 text-t2">
          No cluster is configured yet, so there is nothing to show.
        </p>
        <StatusSummary />
      </main>
    </div>
  );
}

/**
 * The "s/" mark. Assistive technology skips it: the name beside it is the
 * text that identifies the application.
 *
 * The design sets it in white on the accent. White is no token, and the
 * pair is below the contrast WCAG 2.1 AA asks of text, at 4.2:1 in the
 * light theme and 2.7:1 in the dark one. Here it is the surface colour on
 * the hover accent, tokens both, at 5.5:1 and 8.2:1
 * (doc/adr/0014-accessibility-and-browsers.md).
 */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-6.5 place-items-center rounded-[5px] bg-ac-l font-mono text-xs font-medium tracking-[-0.04em] text-(color:--bg-surface)"
    >
      s/
    </span>
  );
}
