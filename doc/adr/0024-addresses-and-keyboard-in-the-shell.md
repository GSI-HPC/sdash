<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0024: Addresses and the keyboard in the shell

Status: accepted

## Context

The shell of the UI is the first code that every later view is built
inside. [0013](0013-frontend-stack.md) names react-router with lazy routes,
and filters and drawers in the URL, and Base UI for dialogs.
[0014](0014-accessibility-and-browsers.md) sets WCAG 2.1 AA. Neither says
what an address looks like, what happens to the focus when the view
changes, or how keys are handled.

The design handoff does not answer these either. Its prototype keeps the
view in the state of one component, so no view has an address, and Back
leaves the prototype. It handles keys in one function that knows every
shortcut, checks for text fields by tag name and has no way to switch the
single-key shortcuts off. Its command palette is a `div` over the page that
does not hold the focus. Radar keeps its shortcuts in a registry with
scopes, two-key sequences and a generated help
([research/radar.md](../research/radar.md#4-frontend)), and
[initial-conclusions.md](../initial-conclusions.md#3-from-radar-adopt-change-skip)
adopts the pattern.

## Decision

Addresses:

- Each view has one address, a path of one segment below the root:
  `/overview`, `/nodes`, `/partitions`, `/reservations`, `/jobs`, `/submit`,
  `/history`, `/accounts`, `/qos`, `/diagnostics`, `/conf` and
  `/api-explorer`. `/` leads to `/overview`. Any other address shows a
  not-found view inside the shell. An address is compared letter for
  letter: `/Nodes` and `/nodes/` are other addresses than `/nodes`, and
  show the not-found view.
- One table, `web/src/routing/views.ts`, holds the views. The routes, the
  navigation, the shortcuts that go to a view, the entries of the palette
  and the tests are worked out from it.
- What a view shows beyond that, its filters, its sort order and its open
  drawer, goes into the query string, through one typed helper. A change
  replaces the entry in the history unless it is one Back should undo, such
  as opening a drawer. No view uses the helper yet.
- Which cluster is shown is not part of the address. This is left open, and
  [Why](#why) says what it waits for.

Arriving at a view:

- The document title becomes the view's title and the name of the
  application.
- The focus moves to the view's `h1`. It does not when the page is loaded,
  and not when only the query string changes.
- A view that fails is arrived at as the report that shows in its place,
  which gets the title and the focus the view would have had.
- A dialog that is open is closed: it belongs to the view it was opened
  over.
- Going to the view that shows already is no arrival and adds no entry to
  the history.
- The first stop of the Tab key on every page is a link that skips to the
  content.

The keyboard:

- A registry holds every shortcut, and one listener reads the keyboard for
  all of them. A component registers its shortcuts with a hook, for as long
  as it is mounted. Nothing else listens for a shortcut.
- A shortcut is one key or a sequence of two, with 1.2 s for the second. It
  has a description and a group, and the help dialog, opened with `?`,
  lists what is registered.
- Scopes follow from where a component is rendered: overlay over view over
  global. The higher scope wins for the same keys.
- A shortcut without the platform's modifier does not run while the focus
  is where text is typed, whether its key types a character or is Enter,
  Delete or an arrow key. Escape is the exception.
- While a dialog is open, no shortcut of a view runs, and of the shell's
  only those with the modifier. The dialog's own run.
- The user can switch off the shortcuts that are typed with character keys
  alone (WCAG 2.1, success criterion 2.1.4). The choice is kept in
  `localStorage`, as the theme is. With them off, the palette's shortcut
  and Escape still work, and the palette offers what the others do.
- A key is the character the keyboard layout types. With the modifier, a
  character outside ASCII counts as the Latin letter of its key, so that
  the palette opens in a layout that types another script.
- The shell's shortcuts are the handoff's: Control or Command with `K` for
  the palette, `g` and a letter for a view, `t` for the theme, `[` for the
  sidebar, Escape to close a dialog. Its `r`, reload, waits for data to
  reload.

The palette:

- The command palette is a modal dialog on Base UI's, as every dialog of
  the shell is. Inside it a text field controls a list box, and the focus
  stays in the text field.
- It lists the views and the actions of the shell. It does not search jobs
  or nodes yet ([0016](0016-e2e-and-fixtures-on-sind.md)).

[ui.md](../ui.md) describes the result for whoever builds a view.

## Why

- An address for each view makes reload, bookmarks, Back and a link in a
  ticket work, which the server was already built for: it answers every
  address that is no file and not under `/api` with the application
  (`internal/server/static.go`).
- One segment under the root leaves the rest of the path to the view, for a
  job's own page, say.
- The cluster is left out because nothing about it is known yet. Whether a
  cluster is named in the path, in the query string or kept as a
  preference depends on how clusters are named and configured, and on
  whether one view can show more than one cluster. No Slurm-facing code
  exists to decide it by ([0016](0016-e2e-and-fixtures-on-sind.md)). Today
  sdash is configured for no cluster, so the addresses name none.
- A single-page application changes the view without loading a page, and a
  screen reader announces nothing unless the focus moves. The heading is
  what a loaded page would have been announced by.
- A registry gives one place for the rules that are easy to get wrong in
  each component: no shortcut while typing, none behind a dialog, none that
  cannot be switched off. The help cannot fall behind, because it is the
  registry.
- A dialog left open over a view that changed would lie over a heading
  that has the focus and is hidden from a screen reader. The browser's
  Back cannot be kept from changing the view, so the dialog goes.
- A palette that is not modal leaves the page behind it in the order of the
  Tab key, and a keyboard user ends up in content they cannot see.

## Costs

- The addresses are public once released. Renaming a view's address breaks
  bookmarks, and needs a redirect that is kept.
- An address typed with a capital letter or a slash at its end gets the
  not-found view, and not the view that was meant.
- When the cluster question is decided, today's addresses have to keep
  working, by leading to a default cluster. If the cluster goes into the
  path, every address changes shape, and every link written until then is
  one of the old shape.
- Moving the focus to the heading takes it away from the link the user
  activated. A keyboard user in the navigation has to return to it for the
  next view, or use the shortcuts.
- A component cannot listen for a key by itself. A shortcut that does not
  fit the registry, three keys, say, or a key held down, needs the registry
  changed.
- A view cannot have Enter or Delete act on its selected row while the
  focus is in one of its text fields. Such a key is handled on the field,
  or given the modifier.
- The single-key shortcuts do nothing while the keyboard types another
  script than Latin. Only the shortcuts with the modifier work there.
- The second key of a sequence is swallowed even when it completes nothing,
  so a mistyped sequence costs a key press.
- A user who switches the single-key shortcuts off loses `?` with them, and
  reaches the help and the switch through the palette.
- The routes and the dialogs bring react-router and Base UI into the
  bundle, the two packages of [0013](0013-frontend-stack.md) that this
  change is the first to use.
