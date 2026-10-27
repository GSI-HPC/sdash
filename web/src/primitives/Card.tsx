// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useId } from "react";

import { cx, panel } from "./classes";
import { Heading, type HeadingLevel } from "./Heading";

/** The props of a card. */
export interface CardProps {
  /**
   * The heading of the card. A card with a title is a region named by it,
   * which a user who moves by headings or by landmarks comes by. One
   * without is a surface and nothing more.
   */
  title?: string;
  /** The level of the heading; 2 unless said otherwise. */
  level?: HeadingLevel;
  /**
   * What stands at the end of the header, beside the title: a link to
   * more of what the card shows, as a rule. It has a name of its own,
   * which says where it leads without the title.
   */
  action?: ReactNode;
  /** A line below the content, apart from it. */
  footer?: ReactNode;
  /**
   * The content runs to the edges of the card, for a list or a table that
   * draws its own lines; padded unless said otherwise.
   */
  flush?: boolean;
  /** Classes for the layout around the card, never for its look. */
  className?: string;
  children: ReactNode;
}

/**
 * A panel on the page: a header with a title and an action, the content,
 * and a footer. Every view of data is made of cards, and the other panels
 * (an empty state, a skeleton, an error panel) take the place of what a
 * card holds while it has nothing to show, so that the card stays where
 * it was.
 */
export function Card({
  title,
  level = 2,
  action,
  footer,
  flush = false,
  className,
  children,
}: CardProps) {
  const headingId = useId();
  const titled = title !== undefined;
  const Tag = titled ? "section" : "div";

  return (
    <Tag
      aria-labelledby={titled ? headingId : undefined}
      className={cx("flex min-w-0 flex-col", panel, className)}
    >
      {(titled || action !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-bds px-4 py-3">
          {titled && (
            <Heading
              level={level}
              id={headingId}
              className="text-[0.84375rem] font-semibold"
            >
              {title}
            </Heading>
          )}
          {action !== undefined && (
            <div className="ml-auto text-xs font-medium">{action}</div>
          )}
        </div>
      )}
      <div className={cx("min-w-0 flex-1", !flush && "px-4 py-3.5")}>
        {children}
      </div>
      {footer !== undefined && (
        <div className="border-t border-bds px-4 py-2.5 text-xs text-t2">
          {footer}
        </div>
      )}
    </Tag>
  );
}
