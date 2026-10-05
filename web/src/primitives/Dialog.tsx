// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useId,
  useRef,
} from "react";

import { useKeyboardScroll } from "../layout/useKeyboardScroll";
import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useOverlayOpen } from "../shortcuts/useShortcuts";
import { cx, floating, layers } from "./classes";
import { useModalPopup } from "./modal";
import { OverlayPopups } from "./popups";
import { showInFull } from "./showInFull";

// The modal dialog of the interface, on Base UI's dialog
// (doc/adr/0013-frontend-stack.md). Base UI brings what a dialog is hard
// to get right in: the focus goes in when it opens, stays in while it is
// open and returns to where it was when it closes; the page behind is
// hidden from assistive technology; Escape closes it, and not while a
// character is being composed; a press outside closes it.
//
// What the module adds is the look of the handoff, the scrim and the
// surface, the standard form of a dialog, and its part in the shortcuts:
// the content of a dialog registers its shortcuts above those of the page,
// and the page's rest for as long as the dialog is open
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md). It also makes
// the page behind inert, which Base UI does not: the focus can get out of
// a dialog by more ways than the Tab key (modal.ts says which).
//
// A dialog is rendered by the component that owns what opens it, so that
// it goes when that component does: a dialog of a view leaves with the
// view when the address changes (doc/ui.md, "Dialogs").
//
// What opens from inside a dialog, the list of a select, a menu, a
// tooltip, is put inside the dialog itself, in a place at its end
// (OverlayPopups in popups.tsx says why).

// Where a dialog stands in the window: hanging from near the top, as the
// palette and the help do, or in the middle, as a confirmation does.
// Neither moves the dialog with a transform. An element that is
// transformed holds everything inside it that is fixed to the window, and
// what opens from inside the dialog is: it would be laid out against the
// dialog and cut off at its edge.
const placements = {
  top: "top-[12vh]",
  middle: "inset-y-0 my-auto h-fit",
} as const;

/** Where a dialog stands in the window. */
export type DialogPlacement = keyof typeof placements;

/** What the parts of a dialog need to know of the dialog they are in. */
interface DialogParts {
  /** The id of the title, which also names the body while it scrolls. */
  readonly titleId: string;
  /** Whether the dialog is an alert dialog, a confirmation. */
  readonly alert: boolean;
}

const PartsContext = createContext<DialogParts | null>(null);

/** The props of a dialog. */
export interface DialogProps {
  /** Whether the dialog shows. */
  open: boolean;
  /** Called when the user dismisses the dialog. */
  onClose: () => void;
  /**
   * The element the focus goes to on opening; without it the first control
   * inside gets it.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Near the top of the window unless said otherwise. */
  placement?: DialogPlacement;
  /**
   * The width, such as `w-150`. Never a transform: what opens from inside
   * the dialog is fixed to the window, and a transformed dialog would cut
   * it off.
   */
  className: string;
  children: ReactNode;
}

/**
 * The frame Dialog and ConfirmDialog share: the scrim, the surface, the
 * focus and the shortcuts. A view uses one of those two and not this.
 *
 * `alert` makes it an alert dialog, which a press outside does not close:
 * it asks a question that has to be answered. `describedBy` names what
 * assistive technology reads with the name of the dialog, in place of its
 * DialogDescription alone: the ids of the elements, separated by spaces.
 */
export function DialogFrame({
  alert = false,
  describedBy,
  open,
  onClose,
  initialFocus,
  placement = "top",
  className,
  children,
}: DialogProps & { alert?: boolean; describedBy?: string }) {
  useOverlayOpen(open);
  const popupRef = useModalPopup(open);
  const titleId = useId();
  // The two differ in the root alone; every other part is the dialog's.
  const Root = alert ? BaseAlertDialog.Root : BaseDialog.Root;

  return (
    <Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          // Also for a dialog that opens from inside a drawer or another
          // dialog, where Base UI would leave the scrim out: what the
          // dialog lies over is dimmed, whatever that is.
          forceRender
          // A press on the scrim does not take the focus: a confirmation
          // stays open under it, and the focus would be left on the page,
          // from where Enter reaches neither of its buttons.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          className={cx("fixed inset-0 bg-scrim", layers.dialogScrim)}
        />
        <BaseDialog.Popup
          ref={popupRef}
          {...(initialFocus ? { initialFocus } : {})}
          {...(describedBy === undefined
            ? {}
            : { "aria-describedby": describedBy })}
          // No higher than 76 % of the window, so that all of it stays on
          // the screen of an enlarged page, and in the middle of the
          // window's width by its margins. In a low window, which is what
          // an enlarged page is, the dialog itself scrolls where its
          // content does not fit for all that: the head and the foot of a
          // dialog can fill those 76 % by themselves, and hidden overflow
          // would then cut the last button off for good. The ring of a
          // dialog that has the focus itself is drawn inside its edge:
          // outside it would lie on the scrim, where it is too faint in
          // the light theme.
          className={cx(
            "fixed inset-x-0 mx-auto flex max-h-[76vh] max-w-[92vw] flex-col overflow-hidden rounded-lg -outline-offset-2 [@media(max-height:30rem)]:overflow-y-auto",
            placements[placement],
            floating,
            layers.dialog,
            className,
          )}
          // A control that takes the focus where the dialog or its body
          // cuts a part of it off is brought into sight in full, which
          // Firefox does not do by itself (showInFull.ts).
          onFocus={(event) => {
            if (event.target.matches(":focus-visible")) {
              showInFull(event.target, event.currentTarget);
            }
          }}
        >
          <PartsContext value={{ titleId, alert }}>
            <ShortcutScope scope="overlay">
              <OverlayPopups>{children}</OverlayPopups>
            </ShortcutScope>
          </PartsContext>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </Root>
  );
}

/**
 * A dialog over the page. It is controlled: `open` says whether it shows,
 * and `onClose` is called when the user dismisses it, by Escape or by a
 * press outside. The content brings its DialogTitle, which names the
 * dialog to assistive technology; DialogHeader has one.
 *
 * A dialog is closed from the moment `open` is false, though it stays on
 * the page until it has left: the keys of the page work again at once, and
 * the focus is out of the dialog at once.
 */
export function Dialog(props: DialogProps) {
  return <DialogFrame {...props} />;
}

/**
 * The title of a dialog: a heading, and the dialog's accessible name. It
 * is Base UI's part handed through, with the id the dialog keeps for it,
 * and takes what that part takes: a dialog that is not in the standard
 * form, as the palette is not, lays its title out itself.
 */
export function DialogTitle(props: ComponentProps<typeof BaseDialog.Title>) {
  const parts = useContext(PartsContext);
  return (
    <BaseDialog.Title {...(parts ? { id: parts.titleId } : {})} {...props} />
  );
}

/**
 * A text that says what the dialog is about. Assistive technology reads it
 * with the name when the dialog opens. Base UI's part, handed through.
 */
export const DialogDescription = BaseDialog.Description;

/**
 * A button that closes the dialog it is in. Base UI's part, handed
 * through: its look is the caller's to give.
 */
export const DialogClose = BaseDialog.Close;

/**
 * The head of a dialog in its standard form: the title, and below it a
 * text that says what the dialog is about. `descriptionId` gives that text
 * an id, for a dialog that is described by more than it.
 */
export function DialogHeader({
  title,
  description,
  descriptionId,
}: {
  title: string;
  description?: ReactNode;
  descriptionId?: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-5 pt-4.5 pb-1">
      <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
      {description !== undefined && (
        <DialogDescription
          {...(descriptionId === undefined ? {} : { id: descriptionId })}
          className="text-[0.8125rem] leading-normal text-t2"
        >
          {description}
        </DialogDescription>
      )}
    </div>
  );
}

/**
 * The part of a dialog that scrolls when the dialog is higher than the
 * window allows, between a head and a foot that stay. It is a stop of the
 * Tab key while it has something to scroll, so that a body without a
 * control in it can be read to its end from the keyboard, and is then a
 * group with the name of the dialog: a stop has to say what it is.
 *
 * In a low window, which is what an enlarged page is, it does not shrink
 * below 56 px, its padding and one field. Where the head and the foot
 * leave it less than that, the dialog scrolls as a whole. The body of a
 * confirmation shrinks further instead: there the question and the
 * buttons are what has to stay on the screen, and the request between them
 * scrolls.
 *
 * `className` lays out the content: a gap, a column.
 */
export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const parts = useContext(PartsContext);
  useKeyboardScroll(
    bodyRef,
    contentRef,
    parts ? { role: "group", "aria-labelledby": parts.titleId } : {},
  );

  return (
    <div
      ref={bodyRef}
      // The ring is drawn inside: the dialog clips what reaches beyond it.
      className={cx(
        "min-h-0 overflow-auto px-5 py-3 -outline-offset-2",
        parts?.alert !== true && "[@media(max-height:30rem)]:min-h-14",
      )}
    >
      <div ref={contentRef} className={className}>
        {children}
      </div>
    </div>
  );
}

/**
 * The foot of a dialog: its buttons at the right, the one that carries on
 * last, and a `note` at the left.
 */
export function DialogFooter({
  note,
  children,
}: {
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-5 pt-4 pb-4.5">
      {note !== undefined && <p className="mr-auto text-xs text-t3">{note}</p>}
      {children}
    </div>
  );
}
