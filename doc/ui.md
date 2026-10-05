<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# The shell of the UI

The shell is what is on the screen whichever view shows: the header, the
sidebar with the navigation, the main region, the command palette and the
keyboard shortcuts. This document is for whoever builds a view inside it.
The decisions behind it are in
[0024](adr/0024-addresses-and-keyboard-in-the-shell.md), the stack in
[0013](adr/0013-frontend-stack.md), and the look comes from the
[design handoff](design/README.md), which it departs from in the places
[listed below](#departures-from-the-handoff).

No view shows cluster data yet
([0016](adr/0016-e2e-and-fixtures-on-sind.md)). Each is a placeholder: its
page header and a card that says no cluster is configured. The Overview
also says which sdash is running.

## Where things are

Everything is under `web/src/`.

| Directory | What it holds |
| --- | --- |
| `routing/` | The view table (`views.ts`), the routes, what happens on arriving at a view, the helper for state in the query string |
| `layout/` | The shell: header, sidebar, main region, skip link, page header, the shell's commands |
| `nav/` | The navigation inside the sidebar |
| `views/` | One component for each view, the shared placeholder, the not-found view |
| `shortcuts/` | The shortcut registry, its hook, the help dialog |
| `palette/` | The command palette and its scoring |
| `overlay/` | The modal dialog, on Base UI |
| `icons/` | Every icon, as path data, and the component that draws one |
| `theme/`, `storage/` | The theme, and the preferences kept in `localStorage` |
| `status/` | The part of the Overview that says which sdash is running |
| `client/`, `api/` | The one way to call the browser API, and the types generated from `api/openapi.yaml` |
| `styles/` | The stylesheet, and the design tokens in `tokens.css` |
| `testing/` | What the tests of the shell and of the shortcuts share |

## Views and their addresses

`routing/views.ts` holds the table of views. The routes, the navigation,
the `g` shortcuts and the entries of the palette are worked out from it,
and so are the tests that visit every view.

| View | Address | Keys | Group |
| --- | --- | --- | --- |
| Overview | `/overview` | `g` `o` | Cluster |
| Nodes | `/nodes` | `g` `n` | Cluster |
| Partitions | `/partitions` | `g` `p` | Cluster |
| Reservations | `/reservations` | `g` `r` | Cluster |
| Jobs | `/jobs` | `g` `j` | Workload |
| Submit job | `/submit` | `g` `s` | Workload |
| Job history | `/history` | `g` `h` | Workload |
| Accounts & users | `/accounts` | `g` `a` | Accounting |
| QOS & fairshare | `/qos` | `g` `q` | Accounting |
| Diagnostics | `/diagnostics` | `g` `d` | System |
| slurm.conf | `/conf` | `g` `c` | System |
| API explorer | `/api-explorer` | `g` `x` | System |

`/` leads to `/overview`. Any other address shows the not-found view, inside
the shell. The server answers every address that is not a file or under
`/api` with the application, so a reload of a view and a link to one work.

A view has the one address of its row, compared letter for letter.
`/Nodes`, `/nodes/` and `/nodes/r07` are the addresses of no view: each
shows the not-found view, stays in the address bar as it was typed, and
marks no link of the navigation. `viewAt` in `routing/views.ts` says which
view an address shows. The routes and the navigation both ask it, and not
the router's own matching, which ignores case and a slash at the end and
takes `/nodes/r07` to be inside `/nodes`. So the link marked with
`aria-current="page"` is always the one of the view that shows.

A view is a component in `views/`, loaded when it is first opened, so each
is a file of its own in the build. `routing/AppRoutes.tsx` maps the id of
each row to its component, and does not compile while a row has none.

A view that fails is reported in the main region, with a button to reload,
and the shell stays (`routing/ViewBoundary.tsx`). The report tells two
failures apart. A view whose file cannot be fetched, because sdash was
stopped or replaced since the page was opened, "did not load", and stays so
until the page is reloaded. A view that was loaded and broke while it was
drawn "failed", which is a defect of sdash; going away and coming back
draws it anew.

To add a view, follow the `new-view` skill in `.agents/skills/`.

## Titles and focus

A view starts with `PageHeader` from `layout/PageHeader.tsx`: its one `h1`
and a line below it. Rendering it is all a view does for what follows.

- The document title becomes the title of the view and the name of the
  application, such as `Jobs - sdash`.
- When the user arrives at the view by navigating, the focus moves to the
  `h1`, which has `tabindex="-1"`, so that a screen reader reads the name
  of the new page. This holds for a link, a shortcut, the palette, and the
  browser's Back and Forward.
- The focus is not moved when the page is loaded: the browser has announced
  it, and the focus belongs at the top, where the skip link is. Being led
  on from `/` to `/overview` is part of that load.
- The focus is not moved when only the query string changes, so a filter
  does not take the focus from the control that set it.
- The main region is scrolled to its top.
- A dialog that is open is closed, as described under
  [Dialogs](#dialogs).

One mechanism does this for every arrival (`routing/arrival.tsx`). The
`ArrivalProvider` around the shell watches the address, and notes, when its
path changes, that an arrival is owed a heading. A heading in the main
region registers with `useArrival`, and the one that is on the page for the
address that shows takes the focus. The two halves need not come in a fixed
order, so the rule holds where the view does not simply show:

- A view whose file is still being fetched gets the title and the focus
  when it arrives, also when the user went to it before the first view of
  the page had shown.
- A view that fails is arrived at as its report (`routing/ViewBoundary.tsx`),
  whose heading registers like a page header: the report names the
  document and takes the focus, and going back from it is an arrival like
  any other.

A heading that is not a `PageHeader`, as the report's is not, calls
`useArrival` itself and has `tabindex="-1"`.

Going to the view that shows already, by its keys or through the palette,
does nothing and adds no entry to the history, as a click on its link adds
none.

The first stop of the Tab key on every page is the link "Skip to main
content", which moves the focus to the `h1`.

A view keeps to one `h1`, with headings below it that descend without a
gap. The card of the placeholder is an `h2`.

## Layout

The sizes are the handoff's, at the browser's default font size. They are
written in `rem`, so they follow a user who has set a larger one.

| Part | Size |
| --- | --- |
| Header | 52 px high |
| Sidebar | 224 px wide; 60 px as the rail |
| Main region | padding 20 px above, 24 px at the sides, 48 px below |
| Sidebar transition | 300 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, as the utility `ease-handoff`; none under `prefers-reduced-motion` |
| Body text | 13 px |

The landmarks of the shell are the banner (the header), a navigation named
"Views" and the main region, and no other. A view may add a named region
inside the main region, as the Overview does with "About". The sidebar is
that navigation: its links, and inside it the button that collapses it,
since content outside every landmark is passed over by a user who moves
from one to the next. The
label of a group names the list below it and is hidden from assistive
technology as a text of its own, so that a screen reader says "Cluster,
list, four items" and not the word twice.

The sidebar collapses to the rail by its button or by `[`, and the choice
is kept in `localStorage` under `sdash.sidebar`. In the rail a link shows
its icon, keeps its name for assistive technology, and shows the name
beside it on hover and on focus. Below 768 px the sidebar is the rail
whatever was chosen, and the button and the shortcut are gone. Below
640 px the search button shrinks to its icon and the cluster switcher to
its light and its arrow. The layout is drawn for widths down to 360 px. It
holds at 320 px, the width WCAG 2.1 measures reflow at (success criterion
1.4.10), which is a page enlarged to four times its size: below 360 px the
name beside the mark is left to assistive technology, so that every control
of the header stays on the screen.

The main region is the scroll container. It is a stop of the Tab key while
it has something to scroll and not otherwise (`layout/useKeyboardScroll.ts`),
so a view with no control in it can still be scrolled from the keyboard.

Of the handoff's header the refresh control, the role pill and the avatar
are left out until there is something for them to show. The status pill
says "No cluster", and the cluster switcher is there but disabled, with
its reason as a description.

### Hints

`layout/Hint.tsx` shows a short label beside a control on hover and on
keyboard focus: the name of a rail item, the name and the key of the theme
toggle, the reason the cluster switcher does nothing. It stands in for the
tooltip primitive, which is not built yet, and it is not the native `title`
attribute. Escape hides it, and the pointer can move onto it.

A hint that names a control says what the control is called to assistive
technology, so that someone who speaks to the computer can say what they
see (WCAG 2.1, success criterion 2.5.3). The hint of the theme toggle is
therefore "Dark theme", the name of the toggle, with its key beside it.

`useHint(side, active)` holds the state of one hint. `active` says whether
its owner shows a hint at the moment: an item of the sidebar does so in the
rail alone. While it is false nothing shows and nothing is remembered.

A hint takes its position from where its owner is on the screen, because
the sidebar clips what reaches beyond its edge. It follows its owner when
the list the owner is in scrolls and when the window changes size, which
enlarging the page does too, goes away once the owner is scrolled out of
sight, and is moved left where it would run off the right edge of a narrow
screen. The position is set by a script as two custom properties, which
the server's Content-Security-Policy allows where it forbids a `style`
attribute in the markup ([0012](adr/0012-local-listener-security.md)).
Nothing else in the shell sets a style from a script.

### Dialogs

`overlay/Modal.tsx` is the modal dialog, and the one module that imports
Base UI's. It takes the focus when it opens, keeps it inside, closes on
Escape and on a press outside, and gives the focus back to the element
that had it. Its content is a shortcut scope of its own, as described
below.

A dialog is closed from the moment its `open` is false, though Base UI
keeps it on the page until it has left: the keys of the page work again at
once, and the focus is out of the dialog at once, so a key pressed right
after Escape is not typed into a text field that is going.

A dialog of the shell belongs to the view it was opened over. When the
address changes under it, by the browser's Back or Forward, it is closed,
and the focus goes to the heading of the view that shows. Left open, it
would lie over a view whose heading has the focus and is hidden from a
screen reader. The root address counts as the Overview it leads to: a
dialog opened before the first view has arrived stays open when it does.

A dialog is no higher than 76 % of the window, and scrolls inside. In a low
window, which is what an enlarged page is, all of it stays on the screen.

## Keyboard shortcuts

A component registers its shortcuts with `useShortcuts` from
`shortcuts/useShortcuts.ts`, and they are gone when it unmounts. There is
no other way to listen for one: the registry has the one `keydown`
listener, so every shortcut follows the same rules and is in the help.

```tsx
useShortcuts([
  {
    keys: "e",
    description: "Expand every row",
    group: "Accounts",
    run: expandAll,
  },
]);
```

`keys` is one key, or two separated by a space for a sequence: `"t"`,
`"g o"`, `"mod+k"`, `"Escape"`. A key is the character it types, a letter
in lower case, or the name `KeyboardEvent.key` gives it. `mod+` is Command
on an Apple system and Control elsewhere. `description` and `group` are
what the help shows. `enabled: false` takes a shortcut out while it cannot
apply.

The rules:

- **Scopes.** A shortcut is registered in the scope its component is
  rendered in: `overlay` inside a dialog, `view` inside the main region,
  `global` elsewhere. For the same keys the higher scope wins.
- **The same keys twice in one scope** are a mistake in the code. The
  shortcut registered last runs, the other never does, and the help lists
  both. A development build, which the tests run too, reports it with
  `console.error` and the ids the registry gave both; the build the binary
  embeds reports nothing and does not throw.
- **While the user types.** A shortcut without `mod+` does not run while
  the focus is in an `input`, a `textarea`, a `select` or an editable
  element, and the key goes to the field. That holds for a key that types
  no character too, `Enter`, `Delete`, `Backspace` and the arrow keys,
  since a field has a use for each. `Escape` is the exception. A shortcut
  with `mod+` runs there.
- **Behind a dialog.** While a dialog is open, no shortcut of a view runs,
  whatever its keys, and of the shell's only those with `mod+`, which is
  how the palette opens over the help. The shortcuts of the dialog run.
- **Single-key shortcuts.** A shortcut typed with character keys alone, a
  letter, a digit or a sign, runs only while the user has such shortcuts
  switched on, and not while a modifier other than Shift is held. AltGr,
  and Option on an Apple system, do not count as modifiers: they are how a
  keyboard types characters such as `[`.
- **Other keyboard layouts.** A key is the character the layout types, so
  `t` does nothing while the keyboard types Cyrillic. With `mod+` a
  character outside ASCII counts as the Latin letter of its key, so that
  the palette opens with Control and the key that carries `K` in a
  Russian, Greek or Hebrew layout.
- **Sequences.** The second key has 1.2 s. A second key that completes
  nothing ends the sequence and does nothing else.
- **A key a component acts on itself** is left alone when the component
  calls `preventDefault`, as a list does with the arrow keys.

The shortcuts of the shell:

| Keys | What it does |
| --- | --- |
| `Ctrl` `K`, or `⌘` `K` | Open the command palette, or close it |
| `?` | Show the keyboard shortcuts |
| `t` | Switch the theme |
| `[` | Collapse or expand the sidebar |
| `Esc` | Close the open dialog |
| `g` and a letter | Go to a view, by the letters of the table above |

The handoff's `r`, reload, is left out until there is data to reload. The
dialog acts on Escape itself; the registry only lists it.

`?` opens the help, which lists what is registered at that moment. Below
the list is the switch "Single-key shortcuts" (WCAG 2.1, success criterion
2.1.4), kept in `localStorage` under `sdash.shortcuts.character-keys`. With
it off, the palette's shortcut and Escape still work, and the palette
offers everything the others do, the switch included. A control that shows
its shortcut uses `Keys` from `shortcuts/Keys.tsx`, which draws nothing for
a shortcut that is switched off, and tells assistive technology the key
with `useAriaKeyShortcuts`: the search button, the button that collapses
the sidebar and the theme toggle do.

## The command palette

The palette is a modal dialog with a text field and a list: a combobox
that controls a list box. The focus stays in the text field; the arrow
keys, Home and End move a marker, Enter chooses, and the pointer does the
same. A change of the query puts the marker back on the first entry. The
list scrolls the marked entry into view when the keyboard moved the
marker, and not when the pointer did: the list would slide away under it.

The button beside the text field shows the key that closes the palette and
is named "Esc to close": what a control shows is the start of its name
(WCAG 2.1, success criterion 2.5.3).

Its entries come from `shellPaletteItems` in `layout/commands.ts`: one for
each row of the view table, and the actions of the shell, which are to
switch the theme, to collapse or expand the sidebar, to show the keyboard
shortcuts and to switch the single-key shortcuts on or off. A new view
gets its entry from its row, with the `keywords` of the row as further
words to find it by. An entry has a label, keywords, a kind and what it
does; a new kind gets its heading in `palette/items.ts`.

A query is matched against the label and the keywords
(`palette/score.ts`): the start of the label is best, then the inside of
the label, then a keyword, then the letters of the query scattered over the
label in order. Entries are grouped by kind, and the group with the best
match comes first, so Enter takes the best match of all.

The palette does not find jobs, nodes or users. That needs a cluster.

## State in the address

A filter, a sort order and an open drawer belong in the query string, so
that a reload and a pasted link show the same thing. A view defines each
parameter once and uses it as state:

```tsx
const state = defineSearchParam(
  "state",
  oneOf(["all", "running", "pending"]),
  "all",
);

const [filter, setFilter] = useSearchParam(state);
setFilter("running"); // replaces the entry in the history
setFilter("running", { history: "push" }); // adds one, which Back undoes
```

`routing/searchParams.ts` has `defineSearchParam` and the codecs `text`,
`integer` and `oneOf`; `routing/useSearchParam.ts` has the hook. A text in
the address that is no value of the parameter reads as the fallback, and a
value that is the fallback is left out of the address. A value has one
spelling, so that a state has one address: `integer` reads `7` and `-3`,
and takes `007`, `+7`, `-0` and `7` with a space for no number. No view
uses the helper yet.

An event that changes two parameters, a filter that also puts the list
back on its first page, makes one navigation of it with `useSearchChanges`:

```tsx
const changeSearch = useSearchChanges();
changeSearch([setTo(state, "running"), setTo(page, 1)]);
```

Two setters of `useSearchParam` called in one event do not add up. The
router hands each the query string it last rendered, so the second
navigation undoes the first.

Which cluster is shown is not in the address; that is left open in
[0024](adr/0024-addresses-and-keyboard-in-the-shell.md).

## Departures from the handoff

The handoff is [design/README.md](design/README.md) and the prototype
beside it. This section lists every place where the shell differs from it,
one line each with its reason, for the designer to accept or to change. A
change that adds a departure adds its line here.

### Colours

The values of the tokens are the handoff's
(`web/src/styles/tokens.css`). Where a pair of tokens the handoff uses is
below the 4.5:1 that WCAG 2.1 AA asks of text, the shell uses another token
for that text. The ratios are light theme, then dark theme.

| Where | The handoff | The shell | Why |
| --- | --- | --- | --- |
| The mark "s/" | white on `--ac`: 4.2:1, 2.7:1 | `--bg-surface` on `--ac-l`: 5.5:1, 8.2:1 | White is no token, and the pair fails in both themes |
| Group labels of the sidebar | `--t4` on `--bg-surface`: 2.4:1, 3.5:1 | `--t3`: 4.8:1, 8.5:1 | Fails in both themes |
| The line below a page's heading | `--t3` on `--bg-base`: 4.4:1, 9.3:1 | `--t2`: 6.4:1, 13.6:1 | Fails in the light theme |
| Text and icon of the search button | `--t3` on `--bg-elevated`: 4.2:1, 7.6:1 | `--t2`: 6.0:1, 11.1:1 | Fails in the light theme |
| The key cap in the search button | `--t3` on `--bg-elevated`: 4.2:1, 7.6:1 | the button's `--t2`: 6.0:1, 11.1:1 | Fails in the light theme |
| The keys beside an entry of the palette | `--t3` on `--bg-hover` in the marked row: 3.9:1, 6.5:1 | `--t2`: 5.6:1, 9.5:1 | Fails in the light theme |
| A link under the pointer | `--ac` on `--bg-base`: 3.8:1, 6.9:1 | stays `--ac-t`, underlined: 5.2:1, 9.0:1 | Fails in the light theme |

Everywhere else the shell has the handoff's pairs, among them `--t3` on
`--bg-surface` (4.8:1), which the collapse button, the headings and the
footer of the palette and the disabled cluster switcher use. `--t4` is used
for no text, only for the lights of the status pill and of the cluster
switcher, which repeat what the text beside them says.

### Look and wording

| Where | The handoff | The shell | Why |
| --- | --- | --- | --- |
| The keyboard focus | No ring; the prototype removes outlines | A 2 px ring in sdash's own token `--focus` | A keyboard user has to see where the focus is (WCAG 2.1, 2.4.7) |
| Tooltips | The native `title` attribute | A `Hint`, on hover and on keyboard focus, which Escape hides | A `title` is out of reach of the keyboard |
| The hint of a rail item | A `title` at the pointer | Beside the icon, over the start of the main region, here the first letters of the line below the heading | The sidebar clips what is laid out inside it |
| A hint whose owner moves | Not drawn | Follows its icon when the rail scrolls or the window changes size, and goes once the icon is scrolled out of sight | Left behind it would name another item; put away it would be lost to someone who enlarges the page to read it |
| The theme toggle | Tooltip "Toggle theme (t)" | Hint "Dark theme" with `t` as a key cap | The hint is the name of the toggle, which is pressed or not (WCAG 2.1, 2.5.3) |
| The search button | "Search jobs, nodes, views…" | "Search views and actions" | The palette finds no jobs and no nodes yet |
| The palette's placeholder | "Jump to a view, job id, node, user…" | "Go to a view or run an action" | The same |
| The kind of a palette entry | A column in every row | A heading above the entries of the kind | A screen reader says the kind once, as the name of the group |
| The keys beside a palette entry | Plain text in DM Mono | Bordered key caps | One component draws every shortcut, in the header, the help and the palette |
| The palette's "esc" | A key cap that does nothing | A button, named "Esc to close" | Whoever uses a pointer or a touch screen needs a way to close it |
| The palette's footer | "↵ open", "g + key jumps to a view", "t toggles theme" | "The arrow keys move through the list, Enter chooses, Escape closes." | It names the keys of the palette; those of the shell are in the help |
| The palette with nothing found | "No matches" | "No view or action matches." | It says what was looked for |
| The palette's actions | "Toggle theme" | "Switch to the dark theme", the sidebar, the help and the switch for single-key shortcuts | The palette has to offer what the single-key shortcuts do (WCAG 2.1, 2.1.4) |
| The height of the palette | As high as its list, up to 380 px for the list | At most 76 % of the window, like the help; the marked entry keeps 6 px from the edge it is scrolled to | In a low window, which an enlarged page is, all of it has to stay on the screen |
| A contrast theme of the system | Not drawn | The current link has a 2 px border and the marked palette entry a 2 px outline, in the system's colours | `forced-colors` replaces the backgrounds that show both states; a border for the link, so that the focus ring stays apart from it |
| A narrow screen | Not drawn | Below 768 px the rail, with no button to expand it; below 640 px the search button is its icon and the cluster switcher its light and arrow | Reflow at 320 px (WCAG 2.1, 1.4.10) |
| The name beside the mark | Always shown | Below 360 px left to assistive technology | At 320 px the theme toggle would be cut off |
| A view that failed | Not drawn | A report in the main region, "This view did not load" or "This view failed", with a button to reload | A view is a file of its own that can fail to arrive; the second wording has not been reviewed |
| An address of no view | Not drawn | The not-found view: the address, and a link to the Overview | Views have addresses |
| The sizes | In px | In rem, the handoff's sizes at the default font size | They follow a user who has set a larger font |

### Behaviour

| Where | The handoff | The shell | Why |
| --- | --- | --- | --- |
| Addresses | One page; the view is kept in memory | Each view has an address, and Back and Forward walk the views | Reload, bookmarks and links ([0024](adr/0024-addresses-and-keyboard-in-the-shell.md)) |
| Arriving at a view | The content changes | The title names the view and the focus moves to its heading | A screen reader announces nothing otherwise |
| Back or Forward under an open dialog | No addresses | The palette or the help closes, and the focus goes to the heading of the view that shows | The dialog would lie over a heading that has the focus and is hidden from a screen reader |
| Dialogs | A layer over the page that does not hold the focus | Modal: the focus goes in, stays in and comes back | A keyboard user would end up in content they cannot see |
| The palette's list | The first 14 matches; Enter opens the first | Every match; a marker that the arrow keys, Home, End and the pointer move; Enter chooses the marked entry | The combobox pattern, so that the keyboard reaches every entry |
| Keys while a field has the focus | No shortcut but `⌘K` and Escape in an `input`, `textarea` or `select` | The same, in an editable element too, and for Enter, Delete, Backspace and the arrow keys | A field has a use for each of them |
| Keys behind a dialog | The same keys as without one | No shortcut of a view, whatever its keys, and of the shell only those with Ctrl or Command | The page behind a dialog is not what the user is looking at |
| Another keyboard layout | `⌘K` needs the key that types "k" | With Ctrl or Command the place of the key counts, so the palette opens in a Russian, Greek or Hebrew layout; the single-key shortcuts stay silent there | The key that carries `K` types another character in those layouts |
| Single-key shortcuts | Always on | A switch in the help and in the palette turns them off | WCAG 2.1, 2.1.4 |
| The key `?` | None | Opens the help, which lists every shortcut | A shortcut nobody can look up is found by accident only |
| The key `r`, reload | Reloads the data | Left out | There is no data to reload yet |
| The skip link | None | The first stop of the Tab key | WCAG 2.1, 2.4.1 |
| The sidebar | An `aside` around the navigation | The navigation landmark itself, with the collapse button inside | A landmark of its own would have no name and nothing else in it |

### Not built yet

These are parts of the handoff's shell that wait for a cluster
([0016](adr/0016-e2e-and-fixtures-on-sind.md)), and no departures: the
refresh control, the pill with the user's role and the avatar in the
header; the states of the status pill and its popover, in whose place it
says "No cluster"; the cluster switcher's name, version and menu, in whose
place it is disabled with its reason as a hint; the count beside an item of
the navigation; the API hint beside a page's heading; jobs and nodes in
the palette.

## Tests

The view table has a unit test, and so have the shortcut matching, the
registry's report of a shortcut registered twice, the palette's scoring,
the query-string helper and the shell's commands. The component tests
render the whole application with `renderApp` from `testing/app.tsx`;
`routing/arrival.browser.test.tsx` has views of its own, so that it decides
when the file of a view arrives and whether it does. The Playwright tests
in `web/e2e/` visit every row of the view table: `shell.spec.ts` for the
landmarks, the addresses of no view and the layout, at 360 and at 320 px
too, `navigation.spec.ts` for the ways between views, the browser's history
and the arrivals that do not go well, `keyboard.spec.ts` for the other
shortcuts and the stored preferences, `accessibility.spec.ts` for the axe
scan of every view in both themes and with the sidebar in both forms, and
`zoom-and-contrast.spec.ts` for an enlarged page and a contrast theme of
the system. [testing.md](testing.md) says how each layer is run.
