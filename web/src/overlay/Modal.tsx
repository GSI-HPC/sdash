// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Dialog } from "@base-ui/react/dialog";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
} from "react";

import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useOverlayOpen } from "../shortcuts/useShortcuts";

// The modal dialog of the interface, on Base UI's dialog
// (doc/adr/0013-frontend-stack.md). This is the one module that imports
// it. Base UI brings what a dialog is hard to get right in: the focus goes
// in when it opens, stays in while it is open and returns to where it was
// when it closes; the page behind is inert; Escape closes it, and not
// while a character is being composed; a press outside closes it.
//
// What the module adds is the look of the handoff, the scrim and the
// surface, and its part in the shortcuts: the content of a dialog
// registers its shortcuts above those of the page, and the page's rest
// for as long as the dialog is open
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).

/**
 * A dialog over the page. It is controlled: `open` says whether it shows,
 * and `onClose` is called when the user dismisses it. The content brings
 * its ModalTitle, which names the dialog to assistive technology.
 *
 * `initialFocus` is the element the focus goes to on opening; without it
 * the first control inside gets it. `className` sets width and position.
 */
export function Modal({
  open,
  onClose,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  className: string;
  children: ReactNode;
}) {
  useOverlayOpen(open);

  // Base UI keeps a dialog that has closed on the page until it has left,
  // and gives the focus back only then: a moment today, and as long as the
  // exit takes once a dialog has one. A key pressed in that time would
  // still be typed into the text field of the palette that is going. So
  // the focus is taken out of the dialog the moment it closes. It rests
  // on the page until Base UI puts it where it was, which it still does.
  const popupRef = useRef<HTMLDivElement>(null);
  const releaseFocus = useEffectEvent(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && popupRef.current?.contains(focused)) {
      focused.blur();
    }
  });
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    return () => {
      releaseFocus();
    };
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Popup
          ref={popupRef}
          {...(initialFocus ? { initialFocus } : {})}
          className={`fixed left-1/2 z-51 flex max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-bd bg-surface text-t1 shadow-lg ${className}`}
        >
          <ShortcutScope scope="overlay">{children}</ShortcutScope>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The title of a dialog: a heading, and the dialog's accessible name. */
export const ModalTitle = Dialog.Title;

/** A button that closes the dialog it is in. */
export const ModalClose = Dialog.Close;
