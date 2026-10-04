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

It becomes fully usable once the first two views have set the pattern. Until
then it can name only what the shell of the UI already has, and no view to
copy from. Whoever builds those two views adds the file names, the helpers
and the view to imitate to this skill, in the same PR.

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
   shapes of sdash's own, never raw slurmrestd JSON.
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
5. **Route and lazy component.** Add a declarative route whose component is
   loaded lazily, so that the view is a chunk of its own. Filters, the sort
   order and an open drawer live in the URL: a reload or a pasted link shows
   the same thing. Add the view to the navigation.
6. **Data.** Call the browser API through the client in `web/src/client/`
   only, never with a `fetch` of the view's own. Give the client one
   function for each new operation, written against the types generated
   into `web/src/api/`. The view polls and shows the age of what it displays
   (`doc/adr/0010-read-through-cache-and-polling.md`).
7. **Tokens only.** Every colour comes from a design token of
   `web/src/styles/tokens.css`, which has a value for the light and for the
   dark theme; no literal colour value in a component
   (`doc/adr/0013-frontend-stack.md`).
8. **Keyboard and ARIA.** Go through the checklist below
   (`doc/adr/0014-accessibility-and-browsers.md`).
9. **Tests.** Vitest for the logic (`*.test.ts` beside the code), Vitest
   browser mode for the components (`*.browser.test.tsx`), and a Playwright
   test in `web/e2e/` against the built binary that opens the view, uses it
   by keyboard and runs the axe scan in both themes and in each state the
   view has: loaded, empty, failed, and with each overlay open.
   `web/e2e/support.ts` has `open` and `scan` for it, and
   `web/e2e/shell.spec.ts` shows the scan of the shell.
10. **Documentation.** Update the document in `doc/` that describes the UI,
    `README.md` if the view changes what sdash offers, and write a decision
    record if the view took a decision.
11. **Verify.** Follow the `verify-ui` skill, then the checks of the
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
- A tooltip comes from the tooltip primitive once there is one, never from
  a native `title` attribute, and what it says is also available without a
  pointer.
- State is never carried by colour alone: a badge has its text, a bar its
  value.
- A table has header cells with a scope, and a sortable column says how it
  is sorted (`aria-sort`).
- A disabled action keeps its reason reachable by keyboard and readable by
  a screen reader.
- Data that changes under polling does not move the focus, and a change the
  user must notice is announced through a live region.
- The view has one `h1`, and its headings descend without a gap.
- Motion respects `prefers-reduced-motion`.
- Every key binding the view adds is listed where the app lists its keys,
  and does not fire while the user types in a field.
