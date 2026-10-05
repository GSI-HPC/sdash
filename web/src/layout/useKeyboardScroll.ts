// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type RefObject, useEffect } from "react";

/**
 * Makes a scroll container reachable by the Tab key for as long as it has
 * something to scroll, and only then.
 *
 * A keyboard scrolls the region the focus is in. A user who has not put
 * the focus inside the region cannot scroll it, unless the region itself
 * takes the focus (WCAG 2.1, success criterion 2.1.1; axe checks it as
 * "scrollable-region-focusable"). A region with nothing to scroll must not
 * take it: it would be a stop of the Tab key that does nothing. Chrome and
 * Firefox do the same by themselves for a region without controls in it;
 * Safari does not.
 *
 * So the tabindex follows from the layout: 0 while the content is larger
 * than the container, and otherwise -1, which leaves the region out of the
 * order of the Tab key and still lets a script give it the focus. The hook
 * owns the attribute and sets it on the element, from the same observer
 * that measures. The element must not also declare a tabIndex in its JSX.
 * (A literal one there is also what the lint rule
 * jsx-a11y-x/no-noninteractive-tabindex objects to; a region that scrolls
 * is the case that rule does not know.)
 *
 * `containerRef` is the element that scrolls and `contentRef` the one
 * element inside it that holds everything: the container keeps its size
 * when its content grows, so the content is watched as well.
 */
export function useKeyboardScroll(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) {
      return undefined;
    }
    container.tabIndex = -1;
    // The observer reports once when it starts to observe, which is the
    // first measurement.
    const observer = new ResizeObserver(() => {
      const scrolls =
        container.scrollHeight > container.clientHeight ||
        container.scrollWidth > container.clientWidth;
      container.tabIndex = scrolls ? 0 : -1;
    });
    observer.observe(container);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [containerRef, contentRef]);
}
