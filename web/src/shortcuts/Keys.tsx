// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useContext } from "react";

import { Kbd } from "../primitives/Kbd";
import { SettingsContext } from "./context";
import { keyCaps, parseBinding } from "./keys";
import { useShortcutWorks } from "./useShortcuts";

// The sizes as the callers of the shell name them, and the size of the cap
// each one is drawn with.
const sizes = {
  small: "sm",
  medium: "md",
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
 * A cap is drawn by the Kbd primitive, which takes the colour of the text
 * around it and not the handoff's --t3 (doc/ui.md lists the departures).
 * What this component adds is what the registry knows: the platform, and
 * whether the shortcut works.
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
        <Kbd
          // A sequence may press one key twice, so the position is part
          // of the key; the caps of a shortcut never change order.
          key={`${String(position)} ${caps.join(" ")}`}
          size={sizes[size]}
        >
          {caps.join(apple ? "" : " ")}
        </Kbd>
      ))}
    </span>
  );
}
