// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useId } from "react";
import { useLocation } from "react-router";

import { type Group, type View, viewAt, viewsByGroup } from "../routing/views";
import { NavItem } from "./NavItem";

/**
 * The links to the views: the groups of the view table, each a list under
 * its label. It is the only part of the sidebar that scrolls. The landmark
 * around it is the sidebar's (layout/Sidebar.tsx).
 *
 * The link that is marked as current is the one of the view the address
 * shows, which the view table says (viewAt) and the routes ask as well. On
 * an address of no view, "/nodes/r07", say, the not-found view shows and no
 * link is marked.
 */
export function Navigation({ id, rail }: { id: string; rail: boolean }) {
  const { pathname } = useLocation();
  const shown = viewAt(pathname);

  return (
    <div
      id={id}
      className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto px-2.5 py-3.5"
    >
      {viewsByGroup().map(({ group, views }) => (
        <NavGroup
          key={group}
          group={group}
          views={views}
          shown={shown}
          rail={rail}
        />
      ))}
    </div>
  );
}

/**
 * One group. Its label names the list, so a screen reader says "Cluster,
 * list, four items" on entering it. The label is hidden from assistive
 * technology as a text of its own: it would be read once by itself and
 * once more as the name of the list right after it. A name may come from
 * an element that is hidden in this way.
 *
 * The rail has no room for the label and draws a line between the groups
 * in its place; the label stays as the name of the list.
 *
 * The handoff sets the label in --t4, which reaches 2.4:1 against the
 * sidebar in the light theme and 3.5:1 in the dark one, below the 4.5:1
 * WCAG 2.1 AA asks of text. It is --t3 here, at 4.8:1 and 8.5:1
 * (doc/ui.md lists the departures).
 */
function NavGroup({
  group,
  views,
  shown,
  rail,
}: {
  group: Group;
  views: readonly View[];
  shown: View | undefined;
  rail: boolean;
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-0.5">
      {rail && <div aria-hidden="true" className="mx-2 mb-1 h-px bg-(--bds)" />}
      <div
        id={labelId}
        aria-hidden="true"
        className={
          rail
            ? "hidden"
            : "px-2.5 pb-1 text-[0.6875rem] font-medium tracking-[0.02em] whitespace-nowrap text-t3"
        }
      >
        {group}
      </div>
      <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {views.map((view) => (
          <li key={view.id}>
            <NavItem view={view} current={view === shown} rail={rail} />
          </li>
        ))}
      </ul>
    </div>
  );
}
