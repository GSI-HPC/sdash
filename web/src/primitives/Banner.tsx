// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cx } from "./classes";
import { IconButton } from "./IconButton";

// The tint of each tone, and the colour of its dot. The handoff sets the
// title in the tone's text colour, which stands 4.1:1 on the tint of a
// success over the page in the light theme, and the code below the text in
// --t3, which stands 3.8:1 on the tint of an error. The title is in --t1
// here, as the text of a badge, and the code in --t2 like the text above
// it. The dot takes the tone's text colour where the handoff has the solid
// tone, as the dot of a badge does (doc/ui.md lists the departures).
const tones = {
  info: { tint: "bg-info-bg", dot: "bg-info-fg" },
  warn: { tint: "bg-warn-bg", dot: "bg-warn-fg" },
  err: { tint: "bg-err-bg", dot: "bg-err-fg" },
  ok: { tint: "bg-ok-bg", dot: "bg-ok-fg" },
} as const;

/** The tones of a banner: a note, a warning, a failure, a success. */
export type BannerTone = keyof typeof tones;

/** The props of a banner. */
export interface BannerProps {
  tone: BannerTone;
  /** What the banner is about, in a few words. */
  title: string;
  /** What it means, and what the user can do. */
  children?: ReactNode;
  /** A detail in DM Mono below the text: an error message, an address. */
  code?: string;
  /** Controls that do something about it: "Retry now". */
  actions?: ReactNode;
  /**
   * Takes the banner away; without it the banner cannot be dismissed. The
   * caller stops rendering the banner, and the banner has already moved
   * the focus where it belongs (see Banner).
   */
  onDismiss?: () => void;
  /** The name of the button that dismisses; "Dismiss" unless said otherwise. */
  dismissLabel?: string;
  /** Classes for the layout around the banner, never for its look. */
  className?: string;
}

/** The elements the Tab key stops on, near enough for what follows a banner. */
const tabbable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where the focus goes when the banner that has it goes: to the first
 * element after the banner that the Tab key would stop on, which is where
 * a further press of the key would have led, or else to the level-one
 * heading of the view, which every view has and which takes the focus on
 * arrival as well. Without this the focus would go with the banner's
 * button, and the browser would put it on the body, from where the next
 * Tab starts at the top of the page.
 *
 * A banner inside a dialog or the drawer looks no further than the
 * dialog, whose outside is inert, and falls back to the dialog itself.
 */
function focusAfter(banner: HTMLElement): void {
  const dialog = banner.closest<HTMLElement>(
    '[role="dialog"], [role="alertdialog"]',
  );
  const next = [
    ...(dialog ?? document).querySelectorAll<HTMLElement>(tabbable),
  ].find(
    (element) =>
      !banner.contains(element) &&
      banner.compareDocumentPosition(element) &
        Node.DOCUMENT_POSITION_FOLLOWING &&
      element.closest("[inert]") === null &&
      element.checkVisibility({ visibilityProperty: true }),
  );
  const fallback = dialog ?? document.querySelector<HTMLElement>("main h1");
  (next ?? fallback)?.focus();
}

/**
 * A message across a view, above its content: something the user should
 * know about all of the view, as that the data is out of date or the
 * connection is lost. It is no toast: it stays until its cause goes or the
 * user dismisses it.
 *
 * A failure is an alert, which a screen reader announces at once; the
 * other tones are a status, announced when the reader has finished what
 * it was saying. A screen reader announces what changes inside such a
 * region, and most say nothing of a region that arrives with its text in
 * it, so the banner is put on the page empty and its text follows, before
 * anything is drawn. The title and the text say what the tone only
 * repeats in colour (WCAG 2.1, success criterion 1.4.1).
 *
 * The border is transparent. A contrast theme of the system removes the
 * tint and paints the border, so the banner keeps a boundary there.
 */
export function Banner({
  tone,
  title,
  children,
  code,
  actions,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: BannerProps) {
  const self = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);
  useLayoutEffect(() => {
    setFilled(self.current !== null);
  }, []);

  return (
    <div
      ref={self}
      role={tone === "err" ? "alert" : "status"}
      className={cx(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-transparent px-3.5 py-2.5",
        tones[tone].tint,
        className,
      )}
    >
      {filled && (
        <>
          <div className="flex min-w-0 flex-[1_1_15rem] gap-2.5">
            <span
              aria-hidden="true"
              className={cx(
                "mt-1.25 size-2 shrink-0 rounded-full forced-colors:bg-[color:CanvasText]",
                tones[tone].dot,
              )}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[0.78125rem] font-semibold text-t1">{title}</p>
              {children !== undefined && (
                <div className="text-[0.78125rem] text-t2">{children}</div>
              )}
              {code !== undefined && (
                <code className="font-mono text-[0.6875rem] wrap-anywhere text-t2">
                  {code}
                </code>
              )}
            </div>
          </div>
          {(actions !== undefined || onDismiss !== undefined) && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {actions}
              {onDismiss !== undefined && (
                <IconButton
                  icon="close"
                  label={dismissLabel}
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    const banner = self.current;
                    if (banner?.contains(document.activeElement)) {
                      focusAfter(banner);
                    }
                    onDismiss();
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
