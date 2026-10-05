// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";

import { Icon } from "../icons/Icon";
import { Hint, useHint } from "../layout/Hint";
import type { View } from "../routing/views";

/**
 * The entry of one view in the navigation: a link with the view's icon and
 * its name.
 *
 * `current` says that this is the view that shows. Its link then carries
 * aria-current="page" and the handoff's active look. The navigation decides
 * it from the view table and hands it in: the router's own link for a
 * navigation marks itself for every address that starts with its own, and
 * would mark "Nodes" on "/nodes/r07", where the not-found view shows.
 *
 * In the rail there is room for the icon alone: the name stays in the link
 * for assistive technology, and sighted users get it as a hint beside the
 * icon.
 *
 * The active look is a tinted background and the accent on the icon. A
 * contrast theme of the system replaces both, so there the link of the
 * view that shows has a border, in the colour the system gives a link. A
 * border and not an outline: the outline is the ring of the keyboard
 * focus, which has to show on this link as on any other.
 */
export function NavItem({
  view,
  current,
  rail,
}: {
  view: View;
  current: boolean;
  rail: boolean;
}) {
  const hint = useHint("right", rail);

  return (
    <Link
      to={view.path}
      aria-current={current ? "page" : undefined}
      {...hint.owner}
      className={`group/item flex h-8 items-center gap-2.5 rounded-[5px] px-2.5 whitespace-nowrap hover:no-underline ${
        rail ? "justify-center" : ""
      } ${
        current
          ? "bg-ac-m font-semibold text-ac-t forced-colors:border-2"
          : "font-[450] text-t2 hover:bg-hover hover:text-t1"
      }`}
    >
      <Icon
        name={view.icon}
        className="size-4 stroke-[1.8] text-t3 group-aria-[current=page]/item:text-ac"
      />
      <span className={rail ? "sr-only" : "flex-1"}>{view.title}</span>
      {rail && <Hint state={hint}>{view.title}</Hint>}
    </Link>
  );
}
