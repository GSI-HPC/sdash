// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Icon } from "../icons/Icon";
import { shellKeys } from "../layout/keys";
import { Tooltip } from "../primitives/Tooltip";
import { useAriaKeyShortcuts } from "../shortcuts/useShortcuts";
import { toggleTheme } from "./theme";
import { useTheme } from "./useTheme";

/** The name of the toggle, to assistive technology and in its tooltip. */
const name = "Dark theme";

/**
 * The button in the header that switches between the light and the dark
 * theme and keeps the choice.
 *
 * To assistive technology it is a toggle named "Dark theme" that is pressed
 * or not: the name stays the same and the state is announced when it
 * changes. The icon is decoration and shows, as in the design, the theme a
 * click leads to.
 *
 * It shows an icon and no text, so a sighted user gets its name as a
 * tooltip on hover and on keyboard focus, as for an item of the rail, with
 * the key that does the same beside it. The tooltip says what the name says
 * and not the handoff's "Toggle theme": what a control shows is what
 * someone who speaks to the computer calls it (WCAG 2.1, success criterion
 * 2.5.3). Assistive technology is told the key with the button, as for the
 * other buttons of the shell that have one.
 *
 * The theme is also switched from the keyboard and from the command
 * palette, so the button does not keep it: it shows what the page has
 * (useTheme.ts).
 */
export function ThemeToggle() {
  const dark = useTheme() === "dark";
  const ariaKeys = useAriaKeyShortcuts(shellKeys.theme);

  return (
    <Tooltip label={name} keys={shellKeys.theme} side="bottom">
      <button
        type="button"
        aria-label={name}
        aria-pressed={dark}
        aria-keyshortcuts={ariaKeys}
        onClick={toggleTheme}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-bd bg-surface text-t2 hover:bg-hover hover:text-t1"
      >
        <Icon name={dark ? "sun" : "moon"} className="size-3.75 stroke-[1.9]" />
      </button>
    </Tooltip>
  );
}
