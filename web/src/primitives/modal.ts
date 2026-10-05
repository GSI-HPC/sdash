// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";

// What a modal overlay, a dialog or a drawer, does around its popup beyond
// what Base UI does: it makes everything outside inert, and lets go of the
// focus the moment it closes.
//
// Base UI hides the outside from assistive technology and turns the Tab
// key round at two guards beside the overlay. The guards hold only while
// the focus is inside. The focus leaves by a press on a control that then
// goes, as the button of a toast does, and by way of the browser's own
// controls; from the page the Tab key then walks what lies behind the
// overlay, and every control there works. The hiding does not hold
// everywhere either:
// Base UI leaves every element with an aria-live attribute readable, and
// with it everything that element is in, so that one such element in a
// view would keep the view from being hidden. So the outside is made
// inert as well, which keeps the focus, the pointer and assistive
// technology out of it whatever is in it and whatever brought them there
// (doc/adr/0026-ui-primitives-on-base-ui.md).

const besideAttribute = "data-beside-modal";

/**
 * Marks what stays in reach beside a modal overlay, for its element: the
 * region of the toasts, which reports what the overlay did.
 */
export const besideModal = { [besideAttribute]: "" } as const;

const beside = `[${besideAttribute}]`;

/**
 * How many open overlays keep each element inert. Two can be open at once,
 * the palette over a drawer, and either can go first.
 */
const holders = new Map<Element, number>();

/**
 * Whether an element beside an overlay, or beside something the overlay is
 * in, is to be made inert.
 *
 * An element that holds nothing is left alone: a scrim, which has to take
 * the press that closes its overlay, and a guard of the focus, which turns
 * the Tab key round. One that is inert by somebody else's doing is theirs
 * to release.
 */
function holdable(element: Element): boolean {
  if (element.childElementCount === 0) {
    return false;
  }
  if (element.matches(beside) || element.querySelector(beside)) {
    return false;
  }
  return holders.has(element) || !element.hasAttribute("inert");
}

/**
 * Makes everything outside the given overlay inert, and returns what
 * undoes it: every element beside the overlay, and beside each element the
 * overlay is in, up to the body.
 */
function holdOutside(popup: Element): () => void {
  const held: Element[] = [];
  for (
    let inside = popup;
    inside.parentElement && inside !== document.body;
    inside = inside.parentElement
  ) {
    for (const sibling of inside.parentElement.children) {
      if (sibling !== inside && holdable(sibling)) {
        holders.set(sibling, (holders.get(sibling) ?? 0) + 1);
        sibling.toggleAttribute("inert", true);
        held.push(sibling);
      }
    }
  }
  return () => {
    for (const element of held) {
      const others = (holders.get(element) ?? 1) - 1;
      if (others > 0) {
        holders.set(element, others);
      } else {
        holders.delete(element);
        element.removeAttribute("inert");
      }
    }
  };
}

/**
 * Keeps everything outside a modal overlay inert for as long as `open` is
 * true. `popup` is the element of the overlay itself, once it is on the
 * page.
 *
 * The control that opened the overlay becomes inert with the rest while
 * it still has the focus. The browser takes the focus off it a moment
 * later, and not as it becomes inert: Base UI, which notes in this same
 * step which control to give the focus back to, still finds it there.
 *
 * It ends in the step in which `open` turns false, while React puts that
 * step on the page, which is why this is a layout effect. A control that
 * arrives with that step and takes the focus as it arrives, as a field
 * with autoFocus does, is given it before any effect that waits for the
 * browser to draw, and cannot take it while inert.
 */
function useInertOutside(open: boolean, popup: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!open || !popup) {
      return undefined;
    }
    return holdOutside(popup);
  }, [open, popup]);
}

/**
 * Takes the focus out of an overlay the moment it closes.
 *
 * Base UI keeps an overlay that has closed on the page until it has left,
 * and gives the focus back only then: a moment for a dialog, 300 ms for a
 * drawer that slides out. A key pressed in that time would still be typed
 * into a text field that is going. So the focus is taken out the moment
 * `open` is false. It rests on the page until Base UI puts it where it
 * was, which it still does.
 */
function useFocusRelease(open: boolean, popup: HTMLElement | null): void {
  const releaseFocus = useEffectEvent(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && popup?.contains(focused)) {
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
}

/**
 * What a modal overlay does around its popup, for as long as `open` is
 * true: everything outside it is inert, and the focus leaves it the moment
 * it closes. Returns the ref the popup has to carry.
 *
 * The popup is kept as state and not in a ref object: Base UI puts it on
 * the page a step after `open` turns true, and what is done to the outside
 * has to start then.
 */
export function useModalPopup(
  open: boolean,
): (popup: HTMLElement | null) => void {
  const [popup, setPopup] = useState<HTMLElement | null>(null);
  useInertOutside(open, popup);
  useFocusRelease(open, popup);
  return setPopup;
}
