// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useRef,
} from "react";

import { useKeyboardScroll } from "../layout/useKeyboardScroll";
import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useOverlayOpen } from "../shortcuts/useShortcuts";
import { cx, layers } from "./classes";
import { IconButton } from "./IconButton";
import { useModalPopup } from "./modal";
import { OverlayPopups } from "./popups";
import { showInFull } from "./showInFull";

// The drawer of the handoff: a panel that slides in from the right, over
// the view and below the header, with the details of one thing. It is on
// Base UI's drawer, which is its dialog with a swipe: on a touch screen a
// swipe to the right closes it. It is a modal dialog like the others. The
// focus goes in, stays in and comes back, and the shortcuts of the page
// rest (doc/adr/0026-ui-primitives-on-base-ui.md).
//
// The header of the shell stays in sight above the scrim, as the handoff
// draws it, and does not answer while the drawer is open: a press on it
// closes the drawer like any press outside. Two things see to that. The
// part of the drawer that takes such a press reaches over the header,
// which lies above Base UI's own layer for it; and the page behind, the
// header with it, is inert for as long as the drawer is open (modal.ts).
//
// The primitive is controlled and knows nothing of addresses. A view keeps
// `open` in the query string, so that Back closes the drawer and a link
// opens it (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).

/** What the parts of a drawer need to know of the drawer they are in. */
interface DrawerParts {
  /** Closes the drawer, for the button in its header. */
  readonly close: () => void;
  /** The id of the title, which also names the body while it scrolls. */
  readonly titleId: string;
}

const PartsContext = createContext<DrawerParts | null>(null);

/** The props of a drawer. */
export interface DrawerProps {
  /** Whether the drawer shows. */
  open: boolean;
  /** Called when the user dismisses the drawer. */
  onClose: () => void;
  /** A DrawerHeader, which names the drawer, and a DrawerBody. */
  children: ReactNode;
}

/**
 * A panel at the right edge of the window, as wide as the window on a
 * narrow screen. It is controlled: `open` says whether it shows, and
 * `onClose` is called on Escape, on a press on the scrim, on its close
 * button and on a swipe to the right.
 *
 * It slides in and out in 300 ms, and not at all for a user who asked the
 * system for less motion. It is closed from the moment `open` is false,
 * though it is on the page until it has slid out: the keys of the page
 * work again at once.
 *
 * Opened by the keyboard, it takes the focus itself, so that a screen
 * reader reads its name and starts at its top.
 */
export function Drawer({ open, onClose, children }: DrawerProps) {
  useOverlayOpen(open);
  const popupRef = useModalPopup(open);
  const titleId = useId();

  return (
    <BaseDrawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      swipeDirection="right"
    >
      <BaseDrawer.Portal>
        {/*
          13 is the height of the shell's header, the first row of its grid
          (layout/Shell.tsx): the scrim and the drawer start below it.
        */}
        <BaseDrawer.Backdrop
          className={cx(
            "fixed inset-x-0 top-13 bottom-0 bg-scrim transition-opacity duration-300 ease-handoff data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
            layers.drawerScrim,
          )}
        />
        {/*
          This part covers the header as well, and only keeps the drawer
          below it by its padding. The header has a layer of its own, above
          the one Base UI catches a press outside with. Covered, a press on
          the header is a press on this part, which Base UI takes for one
          outside the drawer. The page behind is inert as well (modal.ts),
          and that alone keeps the controls of the header from answering;
          where a press on an inert element goes instead is the browser's
          to decide, and the press that closes the drawer is not left to
          that.
        */}
        <BaseDrawer.Viewport
          className={cx("fixed inset-0 flex justify-end pt-13", layers.drawer)}
        >
          <BaseDrawer.Popup
            ref={popupRef}
            // The ring of the drawer itself is drawn inside its edge: outside
            // it would lie on the scrim and beyond the window.
            className="flex h-full w-145 max-w-full [transform:translateX(var(--drawer-swipe-movement-x))] flex-col border-l border-bd bg-surface text-t1 shadow-drawer -outline-offset-2 transition-transform duration-300 ease-handoff data-ending-style:[transform:translateX(100%)] data-starting-style:[transform:translateX(100%)] data-swiping:select-none motion-reduce:transition-none"
            // A control that takes the focus where the part that scrolls
            // cuts a part of it off is brought into sight in full, which
            // Firefox does not do by itself (showInFull.ts).
            onFocus={(event) => {
              if (event.target.matches(":focus-visible")) {
                showInFull(event.target, event.currentTarget);
              }
            }}
          >
            {/*
              In a low window, which is what an enlarged page is, the
              header would leave the body no room. There the whole drawer
              scrolls as one, and the body does not scroll by itself.

              This part is no stop of the Tab key, and has to say so:
              Firefox makes a stop of whatever scrolls and carries no
              tabindex, with controls in it or without, and the stop would
              have neither a role nor a name. The keyboard scrolls this
              part from the close button, which every drawer has. A press
              on its text gives it the focus all the same. A ring drawn
              for it then lies inside it, as the drawer's does: outside,
              two of its sides would be beyond the window.
            */}
            <BaseDrawer.Content
              tabIndex={-1}
              className="flex min-h-0 flex-1 flex-col -outline-offset-2 [@media(max-height:30rem)]:overflow-auto"
            >
              <PartsContext value={{ close: onClose, titleId }}>
                <ShortcutScope scope="overlay">
                  {/*
                    The place for what opens from inside the drawer is
                    inside this part too, where Base UI takes a drag of
                    the mouse for a selection of text and not for the
                    swipe that closes the drawer: a drag over the list of
                    a select must not move the drawer.
                  */}
                  <OverlayPopups>{children}</OverlayPopups>
                </ShortcutScope>
              </PartsContext>
            </BaseDrawer.Content>
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}

/** The props of the header of a drawer. */
export interface DrawerHeaderProps {
  /** A line above the title: what kind of thing this is, and its id. */
  eyebrow?: ReactNode;
  /** The title, which is the name of the drawer. */
  title: string;
  /** A line right below the title: a Badge and a few words. */
  meta?: ReactNode;
  /** Buttons, in a row below. */
  actions?: ReactNode;
  /**
   * A TabList, which then lies on the bottom line of the header. Its Tabs
   * go around the header and the body, with the class `contents`, so that
   * the two stay the parts of the drawer that they are.
   */
  children?: ReactNode;
}

/**
 * The header of a drawer, which stays while the body scrolls: the title,
 * the button that closes the drawer, and whatever of the rest is given.
 * Every drawer has one, because its title is what names the drawer.
 */
export function DrawerHeader({
  eyebrow,
  title,
  meta,
  actions,
  children,
}: DrawerHeaderProps) {
  const parts = useContext(PartsContext);
  const hasTabs =
    children !== undefined && children !== null && children !== false;

  return (
    <div
      className={cx(
        "flex shrink-0 flex-col gap-3 border-b border-bd px-4.5 pt-4",
        !hasTabs && "pb-4",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {eyebrow !== undefined && (
            <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-t3 uppercase">
              {eyebrow}
            </div>
          )}
          <BaseDrawer.Title
            {...(parts ? { id: parts.titleId } : {})}
            className="truncate text-lg font-semibold tracking-[-0.01em]"
          >
            {title}
          </BaseDrawer.Title>
          {meta !== undefined && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-t3">
              {meta}
            </div>
          )}
        </div>
        {/*
          A button of its own and not Base UI's close part, which would
          have to hand its props through the tooltip inside the button.
        */}
        <IconButton
          icon="close"
          label="Close"
          keys="Escape"
          {...(parts ? { onClick: parts.close } : {})}
        />
      </div>
      {actions !== undefined && (
        <div className="flex flex-wrap gap-1.5">{actions}</div>
      )}
      {/*
        One pixel down, so that the line of the tab list lies on the line
        of the header and the two read as one.
      */}
      {hasTabs && <div className="-mb-px">{children}</div>}
    </div>
  );
}

/** The props of the body of a drawer. */
export interface DrawerBodyProps {
  /** Classes that lay out the content: a gap, a column. */
  className?: string;
  children: ReactNode;
}

/**
 * The part of a drawer that scrolls, below its header. It is a stop of
 * the Tab key while it has something to scroll, so that a body without a
 * control in it can be read to its end from the keyboard, and is then a
 * group with the name of the drawer: a stop has to say what it is.
 */
export function DrawerBody({ className, children }: DrawerBodyProps) {
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
      className="min-h-0 flex-1 overflow-auto px-4.5 pt-4 pb-7 -outline-offset-2 [@media(max-height:30rem)]:flex-none [@media(max-height:30rem)]:overflow-visible"
    >
      <div ref={contentRef} className={className}>
        {children}
      </div>
    </div>
  );
}
