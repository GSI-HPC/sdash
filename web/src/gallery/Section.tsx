// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { type SectionId, sections } from "./page";

/**
 * One section of the gallery: the heading of a primitive, and below it
 * the examples of that primitive. The heading has the id the list of
 * sections links to, and takes the focus when the address names it
 * (Gallery.tsx), which is what `tabIndex` is for. The title comes from the
 * list of sections, so that the list and the page cannot differ.
 */
export function Section({
  id,
  children,
}: {
  id: SectionId;
  children: ReactNode;
}) {
  const title = sections.find((section) => section.id === id)?.title;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2
        id={id}
        tabIndex={-1}
        className="w-fit rounded-xs text-base font-semibold"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

// What an example lies on. The primitives are drawn for two grounds, a
// card and the page itself, and several of the pairs of colours they use
// differ between the two (doc/ui.md lists them): the scan of the gallery
// has to see both.
const grounds = {
  card: "rounded-lg border border-bd bg-surface px-4 py-3.5 shadow-sm",
  page: "",
} as const;

/**
 * One example of a section: a line that says what it shows, and the
 * controls, in a row that goes on in the next line where the window is
 * narrow. `on` is the ground the controls lie on, a card unless said
 * otherwise.
 */
export function Example({
  title,
  on = "card",
  children,
}: {
  title: string;
  on?: keyof typeof grounds;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[0.71875rem] font-medium text-t2">{title}</h3>
      <div
        className={`flex flex-wrap items-start gap-x-3 gap-y-2.5 ${grounds[on]}`}
      >
        {children}
      </div>
    </div>
  );
}
