// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { ThemeToggle } from "../theme/ThemeToggle";
import { ClusterSwitcher } from "./ClusterSwitcher";
import { Mark } from "./Mark";
import { SearchButton } from "./SearchButton";
import { StatusPill } from "./StatusPill";

/**
 * The header of the application, the banner landmark: the mark and the
 * name, the state of the connection, the cluster switcher, the way into
 * the command palette, and the theme toggle.
 *
 * Of the handoff's header three things are missing because they have
 * nothing to show before there is a cluster: the refresh control, the pill
 * with the user's role, and the avatar
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md). The pill says "No cluster"
 * for the same reason.
 */
export function Header({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="relative z-20 flex min-w-0 items-center gap-3 border-b border-bd bg-base pr-3.5 pl-4 max-sm:gap-2">
      <div className="flex shrink-0 items-center gap-2.25 sm:w-49">
        <Mark />
        {/*
          Below 360 px the header has no room for the name beside the mark:
          at 320 px, the width WCAG 2.1 measures reflow at (success
          criterion 1.4.10), the theme toggle would be cut off at the right
          edge. The name then stays for assistive technology alone, which
          skips the mark.
        */}
        <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] max-[22.5rem]:sr-only">
          sdash
        </span>
        <StatusPill tone="neutral" label="No cluster" />
      </div>
      <ClusterSwitcher />
      <SearchButton onOpen={onOpenPalette} />
      <div className="flex-1" />
      <ThemeToggle />
    </header>
  );
}
