// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useContext } from "react";

import { SettingsContext } from "./context";
import { keyCaps, parseBinding } from "./keys";
import { useShortcutWorks } from "./useShortcuts";

const sizes = {
  // The cap inside a button of the sidebar.
  small: "px-1.25 text-[0.65625rem]",
  // The cap in the header, the palette and the help.
  medium: "px-1.5 py-px text-[0.6875rem]",
} as const;

/**
 * Draws a shortcut as key caps, with the modifier the user's platform has:
 * "⌘K" on an Apple system, "Ctrl K" elsewhere, "g o" for a sequence.
 *
 * The caps are for the eye. Assistive technology skips them: a control
 * names its shortcut in aria-keyshortcuts, and the help spells it out in
 * words. Unless `always` is set, nothing is drawn while the shortcut does
 * not work, so that no control advertises keys the user has switched off.
 *
 * `named` leaves the caps to assistive technology as well. It is for a
 * control that shows nothing but its keys: what a control shows has to be
 * part of its name (WCAG 2.1, success criterion 2.5.3), so that someone
 * who speaks to the computer can say what they see.
 *
 * The handoff sets the caps in --t3, which is below 4.5:1 on the hover and
 * elevated backgrounds they stand on in the light theme. They take the
 * colour of the text around them here (doc/ui.md lists the departures).
 */
export function Keys({
  keys,
  size = "medium",
  always = false,
  named = false,
}: {
  keys: string;
  size?: keyof typeof sizes;
  always?: boolean;
  named?: boolean;
}) {
  const { apple } = useContext(SettingsContext);
  const works = useShortcutWorks(keys);
  if (!works && !always) {
    return null;
  }

  return (
    <span
      aria-hidden={named ? undefined : true}
      className="flex shrink-0 items-center gap-1"
    >
      {keyCaps(parseBinding(keys), apple).map((caps, position) => (
        <kbd
          // A sequence may press one key twice, so the position is part
          // of the key; the caps of a shortcut never change order.
          key={`${String(position)} ${caps.join(" ")}`}
          className={`rounded-[3px] border border-bd2 font-mono ${sizes[size]}`}
        >
          {caps.join(apple ? "" : " ")}
        </kbd>
      ))}
    </span>
  );
}
