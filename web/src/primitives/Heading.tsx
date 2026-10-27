// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

/**
 * The level of the heading a panel starts with. A view has its one
 * level-one heading in its page header, so a panel on the view itself is
 * at level 2, and one inside a panel or a section of the view a level
 * further down. Which it is, only the view that places the panel knows.
 */
export type HeadingLevel = 2 | 3 | 4;

const tags = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * The heading of a panel, at the level the view asks for. The level is
 * for assistive technology, which lists the headings of a page by it; the
 * look is the panel's, the same at every level.
 */
export function Heading({
  level,
  id,
  className,
  children,
}: {
  level: HeadingLevel;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const Tag = tags[level];
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}
