// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { Button } from "./Button";
import { cx } from "./classes";
import { Heading, type HeadingLevel } from "./Heading";

/** The props of an error panel. */
export interface ErrorPanelProps {
  /** What failed, in a sentence: "The figures did not load." */
  title: string;
  /**
   * The title as a heading at this level, where the panel is all a card
   * or a view holds. Without it the title is a paragraph.
   */
  level?: HeadingLevel;
  /** What the user can do about it, or what it means for them. */
  children?: ReactNode;
  /**
   * What went wrong in the words of whatever failed, an error message or
   * a status: set in DM Mono, for whoever reports the failure.
   */
  code?: string;
  /** Tries again. Without it the panel has no button. */
  onRetry?: () => void;
  /** The text of the button; "Retry" unless said otherwise. */
  retryLabel?: string;
  /**
   * Announces the panel to assistive technology when it appears, as an
   * alert. For a failure that comes after the user did something, or
   * after the content showed: a panel that is there from the first moment
   * is found like the rest of the page, and an alert on arriving at a view
   * would be read before the view's own name.
   */
  alert?: boolean;
  /** Classes for the layout around the panel, never for its look. */
  className?: string;
}

/**
 * What stands where content would be when it could not be had: what
 * failed, what the user can do, the error itself, and a button that tries
 * again. It takes the place of the content in its card, as a skeleton
 * does before it; the rest of the view goes on working.
 *
 * The failure is said in words, and the dot beside the title only repeats
 * it in the colour of an error (WCAG 2.1, success criterion 1.4.1). The
 * panel has no tint: it lies in a card, beside others that work, and a
 * card in red would say more than that one thing failed.
 */
export function ErrorPanel({
  title,
  level,
  children,
  code,
  onRetry,
  retryLabel = "Retry",
  alert = false,
  className,
}: ErrorPanelProps) {
  const titleClass = "text-[0.8125rem] font-semibold text-t1";

  return (
    <div
      role={alert ? "alert" : undefined}
      className={cx("flex flex-col items-start gap-1.5 py-2", className)}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-err-fg forced-colors:bg-[color:CanvasText]"
        />
        {level === undefined ? (
          <p className={titleClass}>{title}</p>
        ) : (
          <Heading level={level} className={titleClass}>
            {title}
          </Heading>
        )}
      </div>
      {children !== undefined && (
        <div className="max-w-140 text-[0.78125rem] text-t2">{children}</div>
      )}
      {code !== undefined && (
        <code className="max-w-full font-mono text-[0.6875rem] wrap-anywhere text-t2">
          {code}
        </code>
      )}
      {onRetry !== undefined && (
        <Button size="sm" className="mt-1.5" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
