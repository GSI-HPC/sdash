// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// A browser scrolls to the control that takes the focus, and the engines
// differ in when. Chromium and WebKit scroll whenever a part of the control
// is out of sight, by the least that shows all of it. Firefox scrolls only
// when none of it is in sight: a control that lies across the edge of what
// scrolls takes the focus and stays where it is, cut off with its ring.
// Inside an overlay that scrolls, a dialog or the toasts in a low window,
// that leaves a keyboard user of Firefox on a button of which a part
// shows. So an overlay does for the control that takes the focus what two
// of the three engines do by themselves
// (doc/adr/0026-ui-primitives-on-base-ui.md).

/**
 * What a scroll position leaves over, in pixels: it is a whole number of
 * them where the edge of an overlay lies between two.
 */
const slack = 1;

/**
 * Whether a part of the element is cut off above or below by something
 * between it and `within` that scrolls or clips, `within` included, while a
 * part of it is in sight in each.
 *
 * An element of which nothing is in sight is no case for this: every
 * engine scrolls to it by itself, and puts it where its user is used to
 * finding it. Nor is one in something fixed to the window below `within`,
 * the list of a select that opens from inside a dialog: what scrolls in
 * the dialog does not hold it, and Base UI sees to its place.
 */
function cutOffInPart(element: Element, within: Element): boolean {
  const box = element.getBoundingClientRect();
  let cut = false;
  for (
    let holder = element.parentElement;
    holder;
    holder = holder.parentElement
  ) {
    const style = getComputedStyle(holder);
    if (style.overflowY !== "visible") {
      // The box inside the border, which is where the content is cut.
      const top = holder.getBoundingClientRect().top + holder.clientTop;
      const bottom = top + holder.clientHeight;
      if (box.bottom <= top || box.top >= bottom) {
        return false;
      }
      cut ||= box.top < top - slack || box.bottom > bottom + slack;
    }
    if (holder === within) {
      return cut;
    }
    if (style.position === "fixed") {
      return false;
    }
  }
  // Not inside `within` on the page: React hands an overlay the events of
  // what it rendered, also of an overlay that opened from inside it and
  // lies beside it.
  return false;
}

/**
 * Brings an element that has just taken the focus into sight in full,
 * where a part of it is cut off inside `within`, the overlay it is in. It
 * scrolls by the least that shows all of the element, and not at all where
 * the browser has done so already.
 *
 * It is for the focus the browser draws a ring for, which the caller asks
 * for with `:focus-visible`: the focus of the keyboard, and that of a text
 * field however it came. A press of the mouse on a button that is half in
 * sight leaves the button where it is, as every engine does.
 */
export function showInFull(element: Element, within: Element): void {
  if (cutOffInPart(element, within)) {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
