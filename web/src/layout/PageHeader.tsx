// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useRef } from "react";

import { useArrival } from "../routing/arrival";

/**
 * The block every view starts with: its one level-one heading and a line
 * below it. The heading is also what makes the view known when the user
 * arrives at it (routing/arrival.tsx), so a view that renders this needs
 * to do nothing more for its title or for the focus.
 *
 * The heading is as wide as its text, so that the ring of the keyboard
 * focus frames the words and not the width of the page.
 *
 * The handoff sets the line in --t3, which reaches 4.4:1 on the page
 * background in the light theme, just below the 4.5:1 WCAG 2.1 AA asks of
 * text. It is --t2 here, at 6.4:1 (doc/ui.md lists the departures).
 */
export function PageHeader({
  title,
  summary,
}: {
  title: string;
  summary: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrival(headingRef, title);

  return (
    <div className="flex flex-col gap-1.25">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="w-fit rounded-xs text-xl font-semibold tracking-[-0.01em]"
      >
        {title}
      </h1>
      <p className="text-[0.78125rem] text-t2">{summary}</p>
    </div>
  );
}
