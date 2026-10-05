// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Toast as BaseToast } from "@base-ui/react/toast";
import { type ReactNode, useMemo, useState } from "react";

import { cx, floating, layers } from "./classes";
import { IconButton } from "./IconButton";
import { besideModal } from "./modal";
import { PopupContainer } from "./popups";
import { showInFull } from "./showInFull";

// A toast says that something the user did has happened, or has not: a
// short message at the bottom right that takes no focus and goes by
// itself. It is on Base UI's toast, laid out as the handoff's plain
// column and not as Base UI's stack.
//
// How it reaches a user who does not see it: the toasts appear in one
// region, a landmark named "Notifications" that announces politely, so a
// screen reader reads a new toast when it next pauses and the focus stays
// where it was (WCAG 2.1, success criterion 4.1.3). F6 moves the focus to
// the region, the Tab key goes on into a toast, and Escape dismisses the
// one that has the focus. Every tone is announced in this way, a failure
// too: Base UI's urgent announcement hides the toast one can see from
// assistive technology and leaves it in the order of the Tab key
// (doc/adr/0026-ui-primitives-on-base-ui.md).
//
// How long it stays: five seconds, and a failure until it is dismissed.
// The time stops while the pointer is over a toast, while the focus is in
// the region and while the window is not the active one, so that nobody
// is read a message by a clock (success criterion 2.2.1).

// The dot repeats what the title says. The handoff's solid colours are
// below 3:1 on the surface in the light theme; these are the tones' text
// colours (doc/ui.md lists the departures).
const dots = {
  ok: "bg-ok-fg",
  info: "bg-info-fg",
  warn: "bg-warn-fg",
  err: "bg-err-fg",
} as const;

/** What a toast is about: something done, a note, a warning, a failure. */
export type ToastTone = keyof typeof dots;

/** What a toast says. */
export interface ToastOptions {
  /** The message, in a few words: "Changes saved". */
  title: string;
  /** A line below, set like code: what was sent and what came back. */
  detail?: string;
  /**
   * "ok" unless said otherwise. A toast of the tone "err" stays until it
   * is dismissed.
   */
  tone?: ToastTone;
}

/** What useToast hands a component. */
export interface Toaster {
  /** Shows a toast and returns its id. */
  readonly show: (options: ToastOptions) => string;
  /** Takes the toast of the given id away before its time. */
  readonly dismiss: (id: string) => void;
}

/** What a toast keeps beside its texts. */
interface ToastData {
  readonly tone: ToastTone;
}

/** How long a toast stays, in milliseconds, unless it reports a failure. */
const stay = 5000;

/**
 * Around the application: holds the toasts that show. Everything inside
 * can show one with useToast, and a ToastRegion inside shows them.
 *
 * `timeout` is how long a toast stays, in milliseconds. The application
 * leaves it alone; a test sets a short one.
 */
export function ToastProvider({
  timeout = stay,
  children,
}: {
  timeout?: number;
  children: ReactNode;
}) {
  return (
    // More than five at once would cover the corner of the view, so the
    // oldest beyond five are out of sight. A failure, which stays until it
    // is dismissed, shows again once a newer toast has gone. The time of
    // any other runs on out of sight: it is gone when its time is up,
    // whether it was seen again or not.
    <BaseToast.Provider timeout={timeout} limit={5}>
      {children}
    </BaseToast.Provider>
  );
}

/**
 * Shows toasts, from any component inside the ToastProvider:
 *
 *     const toast = useToast();
 *     toast.show({ title: "Changes saved", detail: "POST /example 200" });
 *
 * The object stays the same from render to render, so it may be named
 * among the dependencies of an effect.
 */
export function useToast(): Toaster {
  const { add, close } = BaseToast.useToastManager<ToastData>();

  return useMemo(
    () => ({
      show: ({ title, detail, tone = "ok" }) =>
        add({
          title,
          description: detail,
          data: { tone },
          // A failure must not be missed: it has no time limit.
          ...(tone === "err" ? { timeout: 0 } : {}),
        }),
      dismiss: (id) => {
        close(id);
      },
    }),
    [add, close],
  );
}

/**
 * The region the toasts appear in, at the bottom right of the window. The
 * application renders it once, in PrimitivesProvider. It is on the page
 * while it is empty too: a region that announces has to be there before
 * what it announces.
 */
export function ToastRegion() {
  const { toasts, close } = BaseToast.useToastManager<ToastData>();
  // The toasts lie over everything else, the tooltips of the page too. So
  // the tooltip of a toast's own button opens inside the region, where it
  // is laid over the toasts, and not beside the region, where it would be
  // under them.
  const [popups, setPopups] = useState<HTMLElement | null>(null);

  return (
    <BaseToast.Portal>
      <BaseToast.Viewport
        // The toasts stay in reach while a dialog or a drawer is open,
        // which makes everything else inert: they report what it did.
        {...besideModal}
        // The ring of the region, which F6 gives the focus, is drawn
        // inside it: outside it would run into the edge of the window.
        // The region is no higher than the window and scrolls inside
        // that: five toasts are higher than the window of an enlarged
        // page, and a toast above its edge could be neither read nor
        // dismissed.
        //
        // What scrolls cuts off whatever reaches beyond it, the shadow of
        // a toast too, in a straight line. So the region reaches to the
        // right and the bottom edge of the window, where the window is
        // what cuts a shadow off, and its padding keeps the toasts 18 px
        // from both, where the handoff has them. At the left of the
        // widest toast it has 60 px of room, and above the first one
        // 36 px: as far as --sh-lg reaches there in the dark theme, which
        // has the larger shadow. On a narrow screen the toasts keep their
        // 18 px from the left edge as well, and the window cuts there.
        //
        // That room is not the region's to take a press from. The region
        // lets the pointer through to the page, as the handoff's does,
        // and each toast takes it back.
        className={cx(
          "pointer-events-none fixed right-0 bottom-0 flex max-h-full w-119.5 max-w-full flex-col items-end gap-2 overflow-y-auto px-4.5 pt-9 pb-4.5 -outline-offset-2",
          layers.toast,
        )}
      >
        <PopupContainer element={popups}>
          {toasts.map((toast) => (
            <BaseToast.Root
              key={toast.id}
              toast={toast}
              // No swipe: a toast is dismissed by its button and by Escape,
              // and a drag over it selects its text.
              swipeDirection={[]}
              // Escape with the focus in a toast dismisses that toast,
              // which Base UI sees to, and does nothing else. Left to go
              // on to the page, the key would also close the dialog or
              // the drawer that is open beside the toasts.
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                }
              }}
              // Where the toasts are higher than the window, the toast
              // the focus comes to, itself or its button, can lie across
              // the edge of the region. It is brought into sight in
              // full, which Firefox does not do by itself
              // (showInFull.ts).
              onFocus={(event) => {
                const region = event.currentTarget.parentElement;
                if (region && event.target.matches(":focus-visible")) {
                  showInFull(event.currentTarget, region);
                }
              }}
              // The ring of a toast is drawn inside its edge: where the
              // region scrolls, a toast lies right at its edge, which cuts
              // off what reaches beyond the toast. A toast is no wider
              // than 400 px, and on a narrow screen no wider than the
              // region has room for.
              className={cx(
                floating,
                "pointer-events-auto flex w-fit max-w-100 min-w-70 items-start gap-2.5 rounded-lg px-3.5 py-2.5 -outline-offset-2 transition-opacity duration-150 ease-handoff data-ending-style:opacity-0 data-limited:hidden data-starting-style:opacity-0 motion-reduce:transition-none",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "mt-1.25 size-2 shrink-0 rounded-full",
                  dots[toast.data?.tone ?? "ok"],
                )}
              />
              <BaseToast.Content className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/*
                  Base UI's title is a heading. A toast comes and goes, and
                  must not come and go in the outline of the page.
                */}
                <BaseToast.Title
                  render={<div />}
                  // A title may be one long word, an id or a path, which
                  // has to break where the toast ends.
                  className="text-[0.78125rem] font-semibold wrap-anywhere"
                />
                <BaseToast.Description
                  render={<div />}
                  className="font-mono text-[0.6875rem] break-all text-t3"
                />
              </BaseToast.Content>
              {/*
                A button of its own and not Base UI's close part, which
                hides itself from assistive technology unless the toasts
                are stacked and spread out, as these never are.
              */}
              <IconButton
                icon="close"
                label="Dismiss"
                variant="ghost"
                size="xs"
                onClick={() => {
                  close(toast.id);
                }}
              />
            </BaseToast.Root>
          ))}
        </PopupContainer>
        {/*
          Out of the column, so that it adds no gap below the toasts. The
          pointer can move onto a tooltip, so the place takes it back from
          the region as the toasts do.
        */}
        <div ref={setPopups} className="pointer-events-auto absolute" />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
