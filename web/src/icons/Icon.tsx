// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type IconName, icons } from "./paths";

/**
 * Draws one icon in the colour of the text around it.
 *
 * An icon is decoration: assistive technology skips it, and whatever it
 * stands beside carries the name, as visible text or as text for screen
 * readers alone. The caller sets the size and the width of the stroke with
 * classes, since the handoff uses several of each.
 */
export function Icon({
  name,
  className,
}: {
  name: IconName;
  className: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`shrink-0 fill-none stroke-current ${className}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name]} />
    </svg>
  );
}
