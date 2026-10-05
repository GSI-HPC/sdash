// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Component, type ReactNode, useRef } from "react";

import { useArrival } from "./arrival";
import { isLoadFailure } from "./loadFailure";

/** The two ways a view can fail, and what the user is told of each. */
const reports = {
  // The file of the view could not be fetched.
  load: {
    title: "This view did not load",
    text: "sdash may have been stopped, or replaced by another version, since this page was opened. Reload the page to get the interface that belongs to the sdash that runs now.",
  },
  // The view was loaded and failed while it was drawn: a defect of sdash.
  render: {
    title: "This view failed",
    text: "Something went wrong while this view was drawn. The other views still work. Reloading the page may bring this one back.",
  },
} as const;

interface Props {
  /**
   * The address that shows. A change of it takes the report away, so that
   * the views the user goes to next show as themselves.
   */
  at: string;
  children: ReactNode;
}

interface State {
  failure: keyof typeof reports | null;
  at: string;
}

/**
 * Catches a view that fails to render, so that the shell around it stays.
 *
 * Each view is a file of its own that the browser fetches when the view is
 * first opened. That fetch fails when sdash was stopped in the meantime,
 * or replaced by another build whose files have other names, and a tab
 * left open across an upgrade is an ordinary thing. Without this the whole
 * page would go blank. With it the user is told, can reload, and can still
 * go to a view that is already loaded.
 *
 * A view can also fail after it was loaded, by a defect in it. That is
 * caught here as well and reported in other words: the advice for a
 * stopped sdash would send the user after the wrong cause.
 *
 * Going to another address shows that view. Coming back draws a view that
 * failed anew. One that did not load stays as it is until the page is
 * reloaded: React keeps the outcome of a lazy import, so no second fetch
 * is made, which is why the report asks for the reload.
 */
export class ViewBoundary extends Component<Props, State> {
  override state: State = { failure: null, at: this.props.at };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failure: isLoadFailure(error) ? "load" : "render" };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return props.at === state.at ? null : { failure: null, at: props.at };
  }

  override render() {
    if (this.state.failure === null) {
      return this.props.children;
    }
    return <Report {...reports[this.state.failure]} />;
  }
}

/**
 * What the main region shows in place of a view that failed. It is an
 * alert, which a screen reader announces when it appears.
 *
 * Its heading takes part in arriving like the page header of a view
 * (arrival.tsx). The view that failed never got to name the document or
 * to take the focus, so the report does both in its place: the tab is not
 * left with the title of the view before, and the focus not on the link
 * that led here, with nothing said about what came of it.
 */
function Report({ title, text }: { title: string; text: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrival(headingRef, title);

  return (
    <div role="alert" className="flex flex-col items-start gap-3.5">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="w-fit rounded-xs text-xl font-semibold tracking-[-0.01em]"
      >
        {title}
      </h1>
      <p className="max-w-140 text-t2">{text}</p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className="h-8 cursor-pointer rounded-md border border-bd bg-surface px-3.5 text-[0.78125rem] font-medium hover:bg-hover"
      >
        Reload
      </button>
    </div>
  );
}
