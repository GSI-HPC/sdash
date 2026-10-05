// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

// Where a popup is put on the page: a tooltip, a popover, a menu, the list
// of a select. Base UI appends one to the body, outside every landmark,
// where a user who moves by landmarks does not come by and axe reports a
// menu, a list box and a tooltip as content in no region. So a popup goes
// into a place that somebody named for it, fixed to the window so that
// nothing around the place clips it: the shell has one inside its main
// region for what opens from the page, a dialog and a drawer each have one
// inside themselves, and the region of the toasts has one. A popup that
// opens from inside another popup, a select in a popover, stays with Base
// UI's default, which puts it beside the popup it came from and so in the
// same place (doc/adr/0026-ui-primitives-on-base-ui.md).

const ContainerContext = createContext<HTMLElement | null>(null);

/**
 * Names the element the popups of everything inside open in. Whoever has
 * such a place renders the element and hands it in; it is null until the
 * element is on the page. The element must have no ancestor that is
 * transformed and clips: a popup is fixed to the window, and such an
 * ancestor would hold it and cut it off.
 */
export function PopupContainer({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return <ContainerContext value={element}>{children}</ContainerContext>;
}

/**
 * Goes around the content of a dialog and of a drawer, and gives it a
 * place of its own, at its end, for what opens from inside it: the list
 * of a select, a menu, a tooltip.
 *
 * Base UI would put such a popup beside the dialog. There it belongs to no
 * landmark and to no dialog, a list box or a menu that a user who moves
 * by landmarks never comes by, and the accessibility scan reports it.
 * Inside the dialog it is part of what the dialog is.
 *
 * To Base UI's own bookkeeping of the focus the place stays outside the
 * dialog, as its popups were before. A dialog that sees the focus vanish
 * from inside itself takes it, onto itself, a frame later. A menu that
 * closes takes the element that has the focus off the page and then puts
 * the focus on its button: the dialog would take it away again. So the
 * place keeps to itself that the focus left something inside it, and the
 * popup that owned it sees to where it goes.
 */
export function OverlayPopups({ children }: { children: ReactNode }) {
  // State and not a ref: the content is rendered again once the element
  // is there, and a popup that is open by then moves into it.
  const [place, setPlace] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!place) {
      return undefined;
    }
    // On the element and not through React, which hears of an event only
    // where the dialog was put on the page, after the dialog itself has.
    function keep(event: FocusEvent) {
      event.stopPropagation();
    }
    place.addEventListener("focusout", keep);
    return () => {
      place.removeEventListener("focusout", keep);
    };
  }, [place]);

  return (
    <ContainerContext value={place}>
      {children}
      {/*
        What it holds is fixed to the window, so the dialog does not cut
        it off, and lies over the content of the dialog.
      */}
      <div ref={setPlace} />
    </ContainerContext>
  );
}

/**
 * Goes around the content of every popup: what opens from inside it
 * belongs to it, and goes where Base UI puts it, beside the popup.
 */
export function NestedPopups({ children }: { children: ReactNode }) {
  return <ContainerContext value={null}>{children}</ContainerContext>;
}

/** What a popup hands the Portal and the Positioner of its Base UI part. */
export interface PopupPlacement {
  readonly portal: { readonly container?: HTMLElement };
  readonly positioner: { readonly positionMethod: "fixed" };
}

/**
 * Where the popup of the calling component goes: into the place that was
 * named for it, or, without one, where Base UI puts it.
 *
 * Either way it is fixed to the window. Laid out inside its place, which
 * is at the end of a region that scrolls, a popup would be cut off where
 * that region ends, and one that takes the focus, the list of a select
 * inside a popover, would have the browser scroll the region to its end
 * to bring the focus into view.
 */
export function usePopupPlacement(): PopupPlacement {
  const container = useContext(ContainerContext);
  return {
    portal: container ? { container } : {},
    positioner: { positionMethod: "fixed" },
  };
}
