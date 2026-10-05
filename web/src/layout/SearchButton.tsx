// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Icon } from "../icons/Icon";
import { Keys } from "../shortcuts/Keys";
import { useAriaKeyShortcuts } from "../shortcuts/useShortcuts";
import { shellKeys } from "./keys";

/**
 * The button in the header that opens the command palette, for whoever
 * does not know its shortcut yet: it shows the shortcut, with the modifier
 * of the user's platform. On a narrow screen it shrinks to its icon and
 * keeps its name.
 *
 * It says what the palette finds today, views and actions. The handoff's
 * text also promises jobs and nodes, which arrive with the cluster data
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 *
 * The handoff sets the text in --t3, which reaches 4.2:1 on the elevated
 * background in the light theme. It is --t2 here, at 6.0:1 (doc/ui.md
 * lists the departures).
 */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  const ariaKeys = useAriaKeyShortcuts(shellKeys.palette);

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts={ariaKeys}
      onClick={onOpen}
      className="flex h-8 max-w-110 min-w-11 flex-[1_1_7.5rem] cursor-pointer items-center gap-2 rounded-md border border-bd bg-elevated px-2.5 text-left text-[0.78125rem] text-t2 hover:bg-hover hover:text-t1 max-sm:size-8 max-sm:min-w-0 max-sm:flex-none max-sm:justify-center max-sm:p-0"
    >
      <Icon name="search" className="size-3.5 stroke-2" />
      <span className="flex-1 truncate max-sm:sr-only">
        Search views and actions
      </span>
      <span className="max-sm:hidden">
        <Keys keys={shellKeys.palette} />
      </span>
    </button>
  );
}
