// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { cx } from "./classes";
import { Heading, type HeadingLevel } from "./Heading";

/** The props of an empty state. */
export interface EmptyStateProps {
  /** That there is nothing, in a sentence: "Nothing matches these filters." */
  title: string;
  /**
   * The title as a heading at this level, where the empty state is all a
   * card or a view holds and nothing else names it. Without it the title
   * is a paragraph.
   */
  level?: HeadingLevel;
  /** Why there is nothing, or what would bring something. */
  children?: ReactNode;
  /** A control that does what the text suggests: clear the filters. */
  action?: ReactNode;
  /** Classes for the layout around the empty state, never for its look. */
  className?: string;
}

/**
 * What stands where content would be when there is none: in a card, in a
 * table with no rows, in a view. It says that there is nothing, which is
 * an answer and no failure, and, where it can, what would change that.
 *
 * The handoff sets it in --t3 and centred. The title is in --t1 and the
 * text in --t2 here, because an empty state lies on the page as well as
 * on a card, and --t3 stands 4.4:1 on the page in the light theme (doc/ui.md
 * lists the departures).
 */
export function EmptyState({
  title,
  level,
  children,
  action,
  className,
}: EmptyStateProps) {
  const titleClass = "text-[0.8125rem] font-medium text-t1";

  return (
    <div
      className={cx(
        "flex flex-col items-center gap-1.5 px-4 py-10 text-center",
        className,
      )}
    >
      {level === undefined ? (
        <p className={titleClass}>{title}</p>
      ) : (
        <Heading level={level} className={titleClass}>
          {title}
        </Heading>
      )}
      {children !== undefined && (
        <div className="max-w-110 text-[0.78125rem] text-t2">{children}</div>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
