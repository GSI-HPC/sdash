// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

/**
 * The "s/" mark. Assistive technology skips it: the name beside it is the
 * text that identifies the application.
 *
 * The design sets it in white on the accent. White is no token, and the
 * pair is below the contrast WCAG 2.1 AA asks of text, at 4.2:1 in the
 * light theme and 2.7:1 in the dark one. Here it is the surface colour on
 * the hover accent, tokens both, at 5.5:1 and 8.2:1
 * (doc/adr/0014-accessibility-and-browsers.md; doc/ui.md lists the
 * departures).
 */
export function Mark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-6.5 shrink-0 place-items-center rounded-[5px] bg-ac-l font-mono text-xs font-medium tracking-[-0.04em] text-(color:--bg-surface)"
    >
      s/
    </span>
  );
}
