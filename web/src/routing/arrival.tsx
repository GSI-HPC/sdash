// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useLocation } from "react-router";

import { documentTitle, leadsTo } from "./views";

// What happens when the user arrives at a view. A browser that loads a
// page announces it to a screen reader and puts the focus at its start. A
// single-page application changes the content without loading anything,
// and nothing is announced unless the application sees to it
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
//
// The two halves of an arrival happen in two places and at two moments.
// The address changes, and the provider sees that whatever shows below
// it. The heading the focus has to go to comes with the view, which may
// still be on its way from the server, and may come as the report of a
// view that failed in its place (ViewBoundary.tsx). So the provider notes
// that an arrival is owed its heading, and whichever heading turns up for
// the address takes the focus. Neither side waits for the other in a fixed
// order.

/** A heading on the page, and the path of the address it was drawn for. */
interface Heading {
  readonly element: HTMLElement;
  readonly path: string;
}

/** What is known about arrivals; one object for the provider's lifetime. */
interface Arrivals {
  /**
   * The path the user is at, as the provider last saw it: the one of the
   * address, or the one the address leads on to.
   */
  path: string;
  /**
   * Whether the user came to that path by navigating and no heading has
   * taken the focus for it yet.
   */
  owed: boolean;
  /** The heading that registered last. */
  heading: Heading | null;
}

/**
 * How a heading makes itself known to the provider: it registers, and
 * calls what it gets back when it leaves the page or the address changes.
 */
type Register = (heading: Heading) => () => void;

const RegisterContext = createContext<Register | null>(null);

/**
 * Gives the focus to the heading when an arrival is owed one and the
 * heading belongs to the address that shows. The path is compared because
 * the heading of the view that is being left can still be registered:
 * React may keep that view on the page, out of sight, while the next one
 * is fetched.
 */
function settle(arrivals: Arrivals): void {
  const { heading } = arrivals;
  if (arrivals.owed && heading?.path === arrivals.path) {
    arrivals.owed = false;
    heading.element.focus();
  }
}

/**
 * Watches the address for the headings inside it (useArrival). It needs a
 * router around it.
 *
 * The page being loaded is no arrival: the browser has just announced it,
 * and the focus belongs at the top, where the skip link is. Nor is a
 * change of the query string an arrival: a filter must not take the focus
 * from the control that set it.
 *
 * The root address counts as the address it leads on to, so a page that
 * is loaded there and sent on has not arrived anywhere either. That
 * cannot be read off the address as it changes: React holds the step from
 * the root back until the first view is fetched, and a user who goes to
 * another view in the meantime is seen to come to it straight from the
 * root.
 */
export function ArrivalProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const arrivalsRef = useRef<Arrivals>({
    path: leadsTo(pathname),
    owed: false,
    heading: null,
  });

  useEffect(() => {
    const arrivals = arrivalsRef.current;
    const path = leadsTo(pathname);
    if (arrivals.path !== path) {
      arrivals.owed = true;
      arrivals.path = path;
      settle(arrivals);
    }
  }, [pathname]);

  const register = useCallback<Register>((heading) => {
    const arrivals = arrivalsRef.current;
    arrivals.heading = heading;
    settle(arrivals);
    return () => {
      // Its own registration only: the heading of the next view may have
      // taken its place already.
      if (arrivals.heading === heading) {
        arrivals.heading = null;
      }
    };
  }, []);

  return <RegisterContext value={register}>{children}</RegisterContext>;
}

/**
 * Makes known what shows in the main region: the document gets the given
 * title, and the heading takes the focus when the user has arrived at the
 * address by navigating, so that a screen reader reads it. The heading
 * needs tabindex="-1" to take the focus.
 *
 * Every heading of the main region goes through here, the page header of a
 * view and the report of a view that failed alike, so that the title and
 * the focus follow every arrival and not only the ones that went well.
 *
 * It needs a router around it. Outside an ArrivalProvider only the title
 * is set, so that a view renders without the shell in a test.
 */
export function useArrival(
  headingRef: RefObject<HTMLElement | null>,
  title: string,
): void {
  const { pathname } = useLocation();
  const register = useContext(RegisterContext);

  useEffect(() => {
    document.title = documentTitle(title);
  }, [title]);

  useEffect(() => {
    const element = headingRef.current;
    if (!register || !element) {
      return undefined;
    }
    return register({ element, path: pathname });
  }, [register, headingRef, pathname]);
}
