// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useId } from "react";

import { Icon } from "../icons/Icon";
import { Navigation } from "../nav/Navigation";
import { Keys } from "../shortcuts/Keys";
import { useAriaKeyShortcuts } from "../shortcuts/useShortcuts";
import { Hint, useHint } from "./Hint";
import { shellKeys } from "./keys";

/**
 * The sidebar: the links to the views, and below them the button that
 * collapses the sidebar to a rail of icons and expands it again.
 *
 * It is the navigation landmark of the page, named "Views", and the one
 * landmark beside the header and the main region. The button is inside it
 * and not beside it: outside, it would be content in no landmark, and a
 * landmark around both, which an aside is, would be a fourth one with no
 * name and nothing of its own to hold.
 *
 * `rail` says which of the two forms shows. `onToggle` is absent where the
 * user has no choice, on a screen too narrow for the full sidebar, and the
 * button is then left out.
 */
export function Sidebar({
  rail,
  onToggle,
}: {
  rail: boolean;
  onToggle: (() => void) | undefined;
}) {
  const linksId = useId();

  return (
    <nav
      aria-label="Views"
      className="flex min-h-0 flex-col overflow-hidden border-r border-bd bg-surface"
    >
      <Navigation id={linksId} rail={rail} />
      {onToggle && (
        <div
          className={`flex shrink-0 border-t border-bds px-2.5 pt-2 pb-3 ${
            rail ? "justify-center" : ""
          }`}
        >
          <CollapseButton rail={rail} controls={linksId} onToggle={onToggle} />
        </div>
      )}
    </nav>
  );
}

/**
 * The button says what a press does, "Collapse sidebar" or "Expand
 * sidebar", and so needs no pressed or expanded state beside its name. Its
 * visible text is the first word of that name, as WCAG 2.1 asks (success
 * criterion 2.5.3), so that someone who speaks to the computer can say
 * what they see.
 */
function CollapseButton({
  rail,
  controls,
  onToggle,
}: {
  rail: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const hint = useHint("right", rail);
  const ariaKeys = useAriaKeyShortcuts(shellKeys.sidebar);

  return (
    <button
      type="button"
      aria-controls={controls}
      aria-keyshortcuts={ariaKeys}
      onClick={onToggle}
      {...hint.owner}
      className="flex h-7.5 cursor-pointer items-center gap-2 rounded-[5px] border border-bd bg-surface px-2.25 text-xs whitespace-nowrap text-t3 hover:bg-hover hover:text-t1"
    >
      <Icon
        name={rail ? "sidebarExpand" : "sidebarCollapse"}
        className="size-3.75 stroke-[1.8]"
      />
      {rail ? (
        <>
          <span className="sr-only">Expand sidebar</span>
          <Hint state={hint}>Expand sidebar</Hint>
        </>
      ) : (
        <>
          <span>
            Collapse<span className="sr-only"> sidebar</span>
          </span>
          <Keys keys={shellKeys.sidebar} size="small" />
        </>
      )}
    </button>
  );
}
