<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0013: The frontend stack

Status: accepted

## Context

The UI exists as a design handoff: a clickable HTML prototype with mock data
that loads its fonts from a CDN and has no accessibility affordances
([research/slurmrestd.md](../research/slurmrestd.md#9-corrections-to-the-design-handoff)).
Its look follows Radar, whose colour tokens it shares, and Radar's frontend
is React, Vite, Tailwind and TanStack Query with no component library:
dialogs, menus, tables and charts are written by hand, and Monaco and other
large packages serve needs that are particular to Kubernetes
([research/radar.md](../research/radar.md#4-frontend)).

## Decision

The stack is the one named in
[initial-conclusions.md](../initial-conclusions.md#8-frontend):

- React and strict TypeScript, built with Vite.
- Tailwind v4, with the handoff's tokens as CSS variables.
- TanStack Query for server state.
- react-router, with lazy routes, and filters and drawers in the URL.
- Base UI for the primitives behind dialogs, menus and tooltips.
- react-virtuoso for the windowed tables.
- DM Sans and DM Mono from fontsource, bundled, so that nothing is fetched
  from another host at run time.
- No chart library and no Monaco. Visualisations are CSS and SVG written
  here.

The frontend is one npm package in `web/`, with its lockfile committed and
npm as the package manager. Its tools are ESLint with typescript-eslint,
Prettier, Vitest and Playwright ([0015](0015-how-tests-are-written.md)).

A dependency is added when it is first used. This record names the stack;
`package.json` gains each package with the change that first imports it. A
runtime dependency beyond this list takes a record of its own
([0020](0020-go-lines-tools-and-libraries.md)).

## Why

- It is Radar's foundation, which the look is modelled on
  ([0001](0001-local-first-binary-with-embedded-ui.md)), without what Radar
  needs for Kubernetes.
- Base UI, where Radar writes its own: the prototype gives no accessible
  dialog, menu or tooltip to start from, and
  [0014](0014-accessibility-and-browsers.md) sets a target for them.
- Bundled fonts work on a machine without a route to the internet, and under
  a Content-Security-Policy that allows no other host.

## Costs

- Building the UI needs Node and npm, and with them a second ecosystem of
  dependencies to update, to scan and to list the licences of. The Go code
  alone still builds without Node.
- Charts, heat maps and three kinds of table are sdash's to write, to test
  and to make accessible.
- React, Vite, Tailwind and the router each make major releases on their
  own schedule, and following one is work that no feature asked for.
