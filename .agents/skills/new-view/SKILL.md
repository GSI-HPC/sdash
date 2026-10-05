---
name: new-view
description: Add a view, a page with its own route, to the sdash UI in the agreed order. The OpenAPI operation comes first, then the generated code, capability gating, the route and its lazy component, design tokens, the keyboard and ARIA checklist, Vitest and Playwright tests with an axe scan, and the documentation. Use when asked to add a page or a view, or to bring a screen of the design handoff into the app.
---

<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Add a view

A view is one page of the app: a route, the component the route loads, the
operations of the browser API it calls, and its tests. This skill gives the
order of work and the rule each step has to meet.

The shell of the UI is there, and `doc/ui.md` describes it: this skill
names its files. No view shows data yet, so there is no data view to copy
from. `web/src/views/Overview.tsx` is the nearest, a placeholder with one
part that calls the browser API. Whoever builds the first two data views
adds what they set as the pattern to this skill, in the same PR.

A view that shows cluster data is Slurm-facing work and waits for slurmrestd
support in sind (`doc/adr/0016-e2e-and-fixtures-on-sind.md`). Until then only
a view that needs no slurmrestd can be built.

## Before starting

- `doc/design/README.md` and the prototype say how the view looks and
  behaves. They are not pixel-exact, and they are not the API:
  `doc/design/sdash-data.js` is mock data, and section 9 of
  `doc/research/slurmrestd.md` lists what the handoff gets wrong about
  slurmrestd.
- Where the handoff leaves a state open (loading, empty, error, a cluster
  that lacks the feature), ask the maintainer, who is the designer.

## Steps

1. **The operation first.** Describe what the view reads and writes in
   `api/openapi.yaml`: the operations, their schemas and the shared error
   body (`doc/adr/0011-openapi-first-browser-api.md`). The browser gets
   shapes of sdash's own, never raw slurmrestd JSON. An operation that
   changes anything, on a cluster or in sdash, is never a GET, whatever
   slurmrestd uses for it: with `--read-only` the server refuses a request
   by its method alone (`doc/adr/0023-the-listeners-as-built.md`).
2. **Generate.** `make generate`, and commit `internal/api/` and
   `web/src/api/` with the change to the document. Never edit a generated
   file.
3. **The server side.** Implement the generated server interface, with Go
   tests whose names state the property
   (`doc/adr/0015-how-tests-are-written.md`).
4. **Capability gating.** Name the capability each part of the view needs
   (`doc/adr/0005-versions-releases-and-capabilities.md`). The frontend asks
   the one gating hook and compares no version. An action the user's role
   lacks is hidden. An action the cluster lacks is shown disabled, with the
   capability's reason.
5. **Row, component, route.** A view is a row of the view table,
   `web/src/routing/views.ts`: its id, address, title, the line under its
   heading, its group in the navigation, its icon (a name from
   `web/src/icons/paths.ts`), the letter that follows `g`, and keywords for
   the command palette. The navigation, the shortcut and the palette entry
   follow from the row. The component is a file in `web/src/views/`, and
   `web/src/routing/AppRoutes.tsx` loads it lazily, so that the view is a
   chunk of its own; that file does not compile until the new id has its
   component. A view that exists as a placeholder already has its row and
   its file: replace the `Placeholder` in the file. The address of a
   released view does not change
   (`doc/adr/0024-addresses-and-keyboard-in-the-shell.md`).
6. **Page header and URL state.** Start the view with `PageHeader`
   (`web/src/layout/PageHeader.tsx`), which gives it its one `h1`, the
   document title and the focus on arrival. Filters, the sort order and an
   open drawer live in the query string, through `defineSearchParam` and
   `useSearchParam` (`web/src/routing/`): a reload or a pasted link shows
   the same thing. An event that sets two parameters uses
   `useSearchChanges`.
7. **Data.** Call the browser API through the client in `web/src/client/`
   only, never with a `fetch` of the view's own. Give the client one
   function for each new operation, written against the types generated
   into `web/src/api/`. The view polls and shows the age of what it displays
   (`doc/adr/0010-read-through-cache-and-polling.md`).
8. **Tokens only.** Every colour comes from a design token of
   `web/src/styles/tokens.css`, which has a value for the light and for the
   dark theme; no literal colour value in a component and no `style`
   attribute (`doc/adr/0013-frontend-stack.md`). Where a pair of tokens the
   handoff uses fails the contrast WCAG 2.1 AA asks for, use another token
   and add the case to the departures in `doc/ui.md`, where every other
   difference from the handoff gets its line too.
9. **Keyboard and ARIA.** Go through the checklist below
   (`doc/adr/0014-accessibility-and-browsers.md`). The view's shortcuts are
   registered with `useShortcuts` (`web/src/shortcuts/useShortcuts.ts`) and
   in no other way; a dialog is `Modal` (`web/src/overlay/Modal.tsx`).
10. **Tests.** Vitest for the logic (`*.test.ts` beside the code), Vitest
    browser mode for the components (`*.browser.test.tsx`), and Playwright
    in `web/e2e/` against the built binary.
    - The tests that go through the view table cover a new row by
      themselves: in `web/e2e/` the landmarks and the checks at 360 and
      320 px of `shell.spec.ts`, which fail on a view too wide for the
      main region, the three ways to a view of `navigation.spec.ts`,
      and the axe scan of `accessibility.spec.ts`, in both themes and both
      forms of the sidebar. Two unit tests state the table as it is and
      have to be told of a new row: `web/src/routing/views.test.ts` and
      `web/src/layout/commands.test.ts`.
    - Add a component test of the view. `renderApp` in
      `web/src/testing/app.tsx` renders the whole application at an
      address, with a function in place of the server;
      `web/src/layout/Shell.browser.test.tsx` shows its use.
    - Add `web/e2e/<view>.spec.ts`, as `overview.spec.ts` is for the
      Overview: it opens the view, uses it by keyboard and runs the axe
      scan in both themes in each state the scan of the view table does not
      reach: empty, failed, and with each overlay open. `support.ts` has
      `openAt`, `heading` and `scan` for it. If the scan has to wait for
      data before the view is settled, say so in `settled` of
      `support.ts`.
11. **Documentation.** Update `doc/ui.md`, `README.md` if the view changes
    what sdash offers, and write a decision record if the view took a
    decision.
12. **Verify.** Follow the `verify-ui` skill, then the checks of the
    `steward` skill.

## Keyboard and ARIA checklist

The target is WCAG 2.1 AA. The axe scan finds only part of it; the rest is
this list.

- Every interactive element is reached with Tab in an order that follows
  the layout, and is operated with Enter or Space. Nothing needs a pointer:
  a table row that opens a drawer on click opens it from the keyboard too.
- The focus ring is visible on every element in both themes.
- An overlay (drawer, dialog, menu, palette) takes the focus when it opens,
  keeps it inside while open, closes on Escape and gives the focus back to
  the element that opened it.
- Controls are native elements or the UI primitives, not a `div` with a
  click handler. Each has an accessible name; a button that shows only an
  icon has an `aria-label`.
- A tooltip is a `Hint` (`web/src/layout/Hint.tsx`) until there is a
  tooltip primitive, never a native `title` attribute, and what it says is
  also available without a pointer.
- State is never carried by colour alone: a badge has its text, a bar its
  value. A state shown by a background alone, a selected row, say, gets an
  outline or a border under `forced-colors:`, where the system replaces
  every background.
- A table has header cells with a scope, and a sortable column says how it
  is sorted (`aria-sort`).
- A disabled action keeps its reason reachable by keyboard and readable by
  a screen reader.
- Data that changes under polling does not move the focus, and a change the
  user must notice is announced through a live region.
- The view has one `h1`, the one `PageHeader` renders, and its headings
  descend without a gap.
- Motion respects `prefers-reduced-motion`.
- Every key binding the view adds is in the help dialog, does not fire
  while the user types in a field, Enter and Delete included, and rests
  behind a dialog. `useShortcuts` sees to all three; `doc/ui.md` has the
  rules.
- A view taller than the window can be scrolled from the keyboard. The
  main region sees to that; a scroll container inside the view needs a
  control in it, or the same treatment
  (`web/src/layout/useKeyboardScroll.ts`).
