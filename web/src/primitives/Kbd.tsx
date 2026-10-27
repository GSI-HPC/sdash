// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { cx } from "./classes";

const sizes = {
  // The cap inside a button of the sidebar and inside a tooltip.
  sm: "px-1.25 text-[0.65625rem]",
  // The cap in the header, the palette and the help.
  md: "px-1.5 py-px text-[0.6875rem]",
} as const;

/** The sizes of a key cap. */
export type KbdSize = keyof typeof sizes;

/**
 * One key cap: the text of a key in a thin border, set in DM Mono.
 *
 * It names no colour. The handoff sets a cap in --t3, which is below 4.5:1
 * on the hover and the elevated background in the light theme, so a cap
 * takes the colour of the text around it (doc/ui.md lists the departure).
 * Its border is decoration: the text is what says which key.
 *
 * It draws what it is given. A shortcut of the registry is drawn with
 * `Keys` from shortcuts/Keys.tsx, which knows the modifier of the user's
 * platform and whether the shortcut works at the moment, and uses this.
 */
export function Kbd({
  size = "md",
  children,
}: {
  size?: KbdSize;
  children: ReactNode;
}) {
  return (
    <kbd
      className={cx("rounded-[3px] border border-bd2 font-mono", sizes[size])}
    >
      {children}
    </kbd>
  );
}
