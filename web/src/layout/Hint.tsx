// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// A hint is a short label that shows beside a control while the pointer is
// over it or the keyboard focus is on it: the name of an item in the
// collapsed sidebar, the reason a control is not available. It stands in
// for the tooltip primitive, which is not built yet, and does without the
// native title attribute, which a keyboard cannot reach and a browser shows
// when it likes.
//
// It meets what WCAG 2.1 asks of content that appears on hover or focus
// (success criterion 1.4.13): the pointer can move onto the hint without
// losing it, it stays for as long as the pointer or the focus does, and
// Escape puts it away.

/** Where a hint is anchored: a point on the edge of its owner. */
interface Anchor {
  readonly x: number;
  readonly y: number;
}

/** The side of the owner a hint shows on. */
export type HintSide = "right" | "below";

function anchorOf(owner: Element, side: HintSide): Anchor {
  const box = owner.getBoundingClientRect();
  return side === "right"
    ? { x: box.right, y: box.top + box.height / 2 }
    : { x: box.left, y: box.bottom };
}

/** Whether a point lies inside a box, its edges included. */
function holds(box: DOMRect, point: Anchor): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

/** What useHint hands back: the two halves of a hint. */
export interface HintState {
  /** The handlers of the element that owns the hint and contains it. */
  readonly owner: {
    readonly onPointerEnter: (event: PointerEvent) => void;
    readonly onPointerLeave: () => void;
    readonly onFocus: (event: FocusEvent) => void;
    readonly onBlur: () => void;
  };
  /** For the Hint element. */
  readonly anchor: Anchor | null;
  readonly side: HintSide;
}

/**
 * The state of one hint. The handlers go on the element that contains both
 * the control and the Hint, so that the pointer is still "over the owner"
 * while it is over the hint.
 *
 * `active` says whether the owner shows a hint at all at the moment: an
 * item of the sidebar does so only in the rail. The handlers stay on the
 * owner all the same. While it is false nothing shows and nothing is
 * remembered, so a hint that was up when the sidebar expanded is not there
 * again, beside an item nobody points at, when it next collapses.
 */
export function useHint(side: HintSide, active = true): HintState {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // Forgotten here, while rendering, and not left to a leave or a blur:
  // neither has to come before the owner shows hints again.
  if (!active && anchor !== null) {
    setAnchor(null);
  }
  const shown = active && anchor !== null;
  const ownerRef = useRef<Element>(null);

  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    function hide() {
      setAnchor(null);
    }
    // On the window and not on the owner: the pointer can rest on a control
    // that does not have the focus, and the key then goes elsewhere.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hide();
      }
    }
    // The hint stands where its owner was when it appeared, and a hint
    // left behind would name whatever is beside it now. So it goes with
    // its owner when the owner moves: when the list it is in scrolls, and
    // when the window changes size, which is also what enlarging the page
    // does. It is not simply put away then: the Tab key scrolls a link
    // into view as it gives it the focus, and the browser reports that
    // scroll after the hint is up; and someone who enlarges the page to
    // read the hint must not lose it by doing so.
    //
    // `within` is the element that scrolled. Once the owner is scrolled
    // out of its sight the hint goes, since it would stand beside nothing.
    function follow(within: Element | null) {
      const owner = ownerRef.current;
      if (!owner?.isConnected) {
        hide();
        return;
      }
      const next = anchorOf(owner, side);
      const outOfSight =
        within !== null && !holds(within.getBoundingClientRect(), next);
      setAnchor(outOfSight ? null : next);
    }
    function onScroll(event: Event) {
      const scrolled = event.target;
      const owner = ownerRef.current;
      // A region that scrolls without the owner in it moves nothing.
      if (scrolled instanceof Node && owner && scrolled.contains(owner)) {
        follow(scrolled instanceof Element ? scrolled : null);
      }
    }
    function onResize() {
      follow(null);
    }
    window.addEventListener("keydown", onKeyDown);
    // Scroll events do not bubble; capturing sees them all.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [shown, side]);

  function show(owner: Element) {
    if (active) {
      ownerRef.current = owner;
      setAnchor(anchorOf(owner, side));
    }
  }

  return {
    owner: {
      onPointerEnter(event) {
        show(event.currentTarget);
      },
      onPointerLeave() {
        setAnchor(null);
      },
      onFocus(event) {
        // A click focuses a control too, and a hint that appeared under the
        // pointer after every click would be noise: it shows for the focus
        // the browser would draw a ring for.
        if (event.target.matches(":focus-visible")) {
          show(event.currentTarget);
        }
      },
      onBlur() {
        setAnchor(null);
      },
    },
    anchor: active ? anchor : null,
    side,
  };
}

/** The least distance, in pixels, a hint keeps from the edge of the window. */
const edgeGap = 8;

const placement: Record<HintSide, string> = {
  // The padding is the gap between owner and label. It belongs to the hint,
  // so the pointer crosses it without leaving.
  right: "-translate-y-1/2 pl-4",
  below: "pt-1.5",
};

/**
 * The label of a hint, rendered inside its owner. It takes its place from
 * the owner's position on the screen and not from the layout around it,
 * because the sidebar clips whatever reaches beyond its edge.
 *
 * With an id, the hint is a description the owner's control points to with
 * aria-describedby, which a screen reader reads whether the hint shows or
 * not. Without one it repeats a name the control already has, and assistive
 * technology skips it.
 */
export function Hint({
  state,
  id,
  children,
}: {
  state: HintState;
  id?: string;
  children: ReactNode;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const { anchor, side } = state;

  // The position is the one value of the interface that only the running
  // page knows, so it cannot be a class. It is set as two custom properties
  // through the style object: the server's Content-Security-Policy forbids
  // a style attribute in the markup, and allows a script to set a style
  // (doc/adr/0012-local-listener-security.md).
  useLayoutEffect(() => {
    const hint = element.current;
    const label = hint?.firstElementChild;
    if (!anchor || !hint || !label) {
      return;
    }
    hint.style.setProperty("--hint-x", `${String(anchor.x)}px`);
    hint.style.setProperty("--hint-y", `${String(anchor.y)}px`);
    // A label that starts at its owner can end beyond the right edge of a
    // narrow window, where nothing scrolls to it: the reason below the
    // cluster switcher on a phone. It is moved left by what it is over.
    const edge = document.documentElement.clientWidth - edgeGap;
    const beyond = label.getBoundingClientRect().right - edge;
    if (beyond > 0) {
      const x = Math.max(edgeGap, anchor.x - beyond);
      hint.style.setProperty("--hint-x", `${String(x)}px`);
    }
  }, [anchor]);

  return (
    <span
      ref={element}
      id={id}
      role={id ? "tooltip" : undefined}
      aria-hidden={id ? undefined : true}
      hidden={anchor === null}
      className={`fixed top-(--hint-y) left-(--hint-x) z-40 cursor-default ${placement[side]}`}
    >
      <span className="block w-max max-w-64 rounded-[5px] border border-bd bg-surface px-2 py-1 text-xs font-medium whitespace-normal text-t1 shadow-lg">
        {children}
      </span>
    </span>
  );
}
