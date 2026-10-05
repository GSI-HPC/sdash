// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

/**
 * The link that takes a keyboard user past the header and the navigation
 * to the content (WCAG 2.1, success criterion 2.4.1). It is the first
 * thing the Tab key reaches on every page, and it is seen only while it
 * has the focus.
 *
 * `target` is the id of the main region, which makes it a link to a place
 * on the page. `onSkip` moves the focus there. The browser is kept from
 * following the link itself: it would add an entry to the history for a
 * jump that is no change of address, and Back would then seem to do
 * nothing.
 */
export function SkipLink({
  target,
  onSkip,
}: {
  target: string;
  onSkip: () => void;
}) {
  return (
    <a
      href={`#${target}`}
      onClick={(event) => {
        event.preventDefault();
        onSkip();
      }}
      // The look is given under "focus:" throughout: what makes the link
      // invisible also takes its padding away, and what undoes that for
      // the focus does not bring it back.
      className="sr-only focus:not-sr-only focus:fixed focus:top-2.5 focus:left-2.5 focus:z-60 focus:rounded-md focus:border focus:border-bd focus:bg-surface focus:px-3 focus:py-1.5 focus:font-medium focus:text-t1 focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}
