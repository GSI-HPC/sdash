<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# The shell of the UI and its primitives

The shell is what is on the screen whichever view shows: the header, the
sidebar with the navigation, the main region, the command palette and the
keyboard shortcuts. The primitives are the controls and overlays a view is
built from: buttons, fields, tabs, tooltips, menus, dialogs, the drawer
and the toasts. This document is for whoever builds a view inside the one
and out of the other. The decisions behind them are in
[0024](adr/0024-addresses-and-keyboard-in-the-shell.md) and
[0026](adr/0026-ui-primitives-on-base-ui.md), the stack in
[0013](adr/0013-frontend-stack.md), and the look comes from the
[design handoff](design/README.md), which they depart from in the places
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
| `primitives/` | The controls and overlays every view is built from, one file each, on Base UI. The one directory that imports Base UI |
| `gallery/` | The gallery: a page that shows every primitive in every state, for the tests and for the designer. No view |
| `icons/` | Every icon, as path data, and the component that draws one |
| `theme/`, `storage/` | The theme, and the preferences kept in `localStorage` |
| `status/` | The part of the Overview that says which sdash is running |
| `client/`, `api/` | The one way to call the browser API, and the types generated from `api/openapi.yaml` |
| `styles/` | The stylesheet, and the design tokens in `tokens.css` |
| `testing/` | What the tests share: the application at an address, shortcuts that log, tooltips, colours and contrast, what the system asks of a page |

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

`/` leads to `/overview`. `/gallery` shows [the gallery](#the-gallery) of
the primitives, which is a page and no view. Any other address shows the
not-found view, inside the shell. The server answers every address that is
not a file or under `/api` with the application, so a reload of a view and
a link to one work.

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
  [Dialogs](#dialogs-confirmations-and-the-drawer).

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
"Views" and the main region, and no other. Beside them the page has one
landmark of the primitives, the region "Notifications" that the
[toasts](#toasts) appear in. A view may add a named region inside the main
region, as the Overview does with "About". The sidebar is that
navigation: its links, and inside it the button that collapses it,
since content outside every landmark is passed over by a user who moves
from one to the next. The
label of a group names the list below it and is hidden from assistive
technology as a text of its own, so that a screen reader says "Cluster,
list, four items" and not the word twice.

The sidebar collapses to the rail by its button or by `[`, and the choice
is kept in `localStorage` under `sdash.sidebar`. In the rail a link shows
its icon, keeps its name for assistive technology, and shows the name
beside it as a [tooltip](#tooltips). Below 768 px the sidebar is the rail
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
its reason as a tooltip that describes it.

The main region ends with the place for the popups of the page: the
tooltips, the popovers, the menus and the lists of selects that open from
a view or from the shell (see [Popups](#popups-and-where-they-go)).

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
  rendered in: `overlay` inside a dialog, a drawer, a popover, a menu or
  the list of a select, `view` inside the main region, `global` elsewhere.
  For the same keys the higher scope wins.
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
  The same holds for every overlay that takes the focus: a drawer, a
  popover, a menu and the open list of a select. A tooltip and a toast
  take no focus and rest nothing.
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
  calls `preventDefault`, as a list does with the arrow keys, and a closed
  select with the letter that chooses an option. Enter and Space on a
  button are not prevented by anything: no view registers either.

The shortcuts of the shell:

| Keys | What it does |
| --- | --- |
| `Ctrl` `K`, or `⌘` `K` | Open the command palette, or close it |
| `?` | Show the keyboard shortcuts |
| `t` | Switch the theme |
| `[` | Collapse or expand the sidebar |
| `Esc` | Close the open dialog |
| `F6` | Go to the notifications, while a toast shows |
| `g` and a letter | Go to a view, by the letters of the table above |

The handoff's `r`, reload, is left out until there is data to reload. The
dialog acts on Escape itself, and the region of the toasts on `F6`; the
registry only lists the two.

`?` opens the help, which lists what is registered at that moment. Below
the list is the switch "Single-key shortcuts" (WCAG 2.1, success criterion
2.1.4), kept in `localStorage` under `sdash.shortcuts.character-keys`. With
it off, the palette's shortcut and Escape still work, and the palette
offers everything the others do, the switch included. A control that shows
its shortcut uses `Keys` from `shortcuts/Keys.tsx`, which draws nothing for
a shortcut that is switched off, and tells assistive technology the key
with `useAriaKeyShortcuts`: the search button, the button that collapses
the sidebar and the theme toggle do. An `IconButton` and a `Tooltip` take
the keys as a prop and do both.

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
shortcuts, to open the component gallery and to switch the single-key
shortcuts on or off. A new view
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

## Primitives

A view is built from the primitives in `primitives/`: one file for each,
named as the component, with named exports and no file that gathers them,
so a view writes `import { Button } from "../primitives/Button"`. They are
built on Base UI, and nothing outside that directory imports Base UI. A
view composes primitives, and gets with them what they see to: the names,
the keyboard, the focus, the contrast and the server's
Content-Security-Policy ([0026](adr/0026-ui-primitives-on-base-ui.md)).
[The gallery](#the-gallery) shows each of them in every state.

| Primitive | What it is for |
| --- | --- |
| `Button` | An action with a text, which is its name. `variant` is `primary` for the one action that carries on, `secondary`, the default, or `ghost` for text alone; `tone="danger"` for an action that deletes or cancels |
| `IconButton` | An action that shows an icon alone. Its `label` is its name and its tooltip, `keys` a shortcut that does the same, and `pressed` makes it a toggle |
| `Badge` | A short label on a tint: a state, a kind, a count. It cannot be pressed. The caller picks the `tone`, and the text carries the meaning |
| `Chip` | A filter that is on or off by itself |
| `Kbd` | One key cap. A shortcut of the registry is drawn with `Keys` from `shortcuts/Keys.tsx`, which uses it |
| `Input` | A text field with its label, and below it a description and an error |
| `Select` | One choice from a list, with the same label, description and error |
| `SegmentedControl` | One of a few options, of which one is always chosen |
| `Tabs`, `TabList`, `Tab`, `TabPanel` | The parts of one thing, of which one shows |
| `Tooltip` | The name of a control that shows an icon alone, or the reason a control cannot be used |
| `Popover` | A panel beside the control that was pressed, for more than a menu holds: a small form, a few filters |
| `Menu`, `MenuItem`, `MenuGroup`, `MenuRadioGroup`, `MenuRadioItem`, `MenuSeparator` | Actions behind a button, and a choice among them |
| `Dialog`, `DialogHeader`, `DialogBody`, `DialogFooter` | A task that keeps the user from the page until it is done or dismissed |
| `ConfirmDialog` | The question before a change is sent, with the request that will be sent |
| `Drawer`, `DrawerHeader`, `DrawerBody` | The details of one thing, beside the list it was opened from |
| `useToast` | The report that something the user did has happened, or has not |

### Looks, sizes and states

A look is chosen by props: `variant`, `tone`, `size`. `className` is for
the layout around a primitive alone, a margin, a width, `flex-1`, a
breakpoint that hides it. It must not restate what a look sets, a colour,
a border, a padding, a height: there is nothing that merges classes, and
of two utilities for one property the order of the stylesheet decides.
No primitive takes a `style`. A look that is missing is a new variant in
the primitive, not a class at the place of use.

Four parts are Base UI's own, handed through for a dialog or a popover
that is not in the standard form, as the palette is not: `DialogTitle`,
`DialogDescription`, `DialogClose` and `PopoverClose`. They take what
Base UI's parts take, and their look is the caller's to give. A view uses
`DialogHeader`, which has the title and the description.

A control has one of four sizes, where the handoff has eight heights
between 20 and 36 px:

| Size | Height | Text | For |
| --- | --- | --- | --- |
| `xs` | 24 px | 11.5 px | The handoff's 20, 24 and 26 px |
| `sm` | 28 px | 12 px | The handoff's 28 px |
| `md`, the default | 32 px | 12.5 px | The handoff's 30, 32 and 34 px |
| `lg` | 36 px | 13 px | The handoff's 36 px |

A button and an icon button have all four; a chip, a field, a select and
a segmented control have `sm` and `md`, and stand level with a button of
the same size. A segmented control of the size `md` has a border around
its track, as the handoff draws it on the page, and one of the size `sm`
has none, as in the handoff's popover.

- **Names.** A control is named by its text. One that shows an icon alone
  takes a `label`; a field and a select always take a `label`, which
  `labelHidden` leaves to assistive technology where a heading says it
  already. An icon is a name from `icons/paths.ts`, never an element.
- **Disabled.** `disabled` takes a control out of the order of the Tab
  key. A control whose reason the user should learn sets
  `focusableWhenDisabled` as well and is wrapped in a `Tooltip` of the
  kind `description` with the reason: it keeps its place, says that it is
  disabled and does nothing. A disabled control dims what it holds and not
  itself, so the ring of the focus is as strong on it as on any other.
- **An option that cannot be chosen** in a select or a menu, and a tab
  that cannot be gone to, is still a stop of the arrow keys. It says that
  it is disabled and does nothing, so that a user of a screen reader
  learns that it exists.
- **Invalid.** An `Input` or a `Select` is invalid when it is given an
  `error`, which is the text that says what is wrong. The boundary only
  shows which field it is about. The text appears in a place below the
  field that is there from the start and has the role `status`, so that a
  screen reader says it when it appears and not only on the next visit to
  the field (WCAG 2.1, success criterion 4.1.3).
- **A label left to assistive technology** is taken out of the flow of the
  page, as everything with the class `sr-only` is. The field holds its
  hidden label itself. A view that hides a text that way inside a region
  that scrolls gives the element around it the class `relative`: the page
  would hold the text otherwise, grow by it, and scroll as a whole.
- **Colours** come from the tokens, in the pairs listed under
  [Colours](#colours); `styles/pairs.test.ts` holds each pair to its least
  contrast. No mapping from a state of a cluster to a tone lives in a
  primitive.
- **A contrast theme of the system** removes every fill. A control
  without a border of its own has a transparent one, which is painted
  there, and a state that a fill or the colour of a border shows, a
  pressed chip, the chosen segment, a pressed toggle, an invalid field,
  has a border twice as thick. An icon that has a colour of its own, the
  tick of a chosen option, the arrow of a select, the lock and the icon
  of a field, takes the colour of the text there.
- **Motion.** The drawer slides and its scrim and a toast fade, on the
  one easing of the handoff, and none of them does for a user who asked
  the system for less motion. Nothing else moves.

A segmented control is a radio group and tabs activate when the focus
arrives: in both the arrow keys change what shows at once, so a view has
to make that change cheap.

### Tooltips

`primitives/Tooltip.tsx` shows a short text beside the control it is
wrapped around: after 300 ms under the pointer, and at once on the focus
of the keyboard, which is the focus the browser draws a ring for. It is
never the native `title` attribute, which a keyboard cannot reach. It
stays for as long as the pointer or the focus does, the pointer can move
onto it, and it follows its control when the control moves and goes when
the control is scrolled out of sight. Touch input gets no tooltip.

Each tooltip stays for as long as its own cause does. The one the
keyboard focus brought up stays when the pointer passes over its control
and leaves, and when the pointer comes to rest on another control, whose
tooltip then shows as well: two can show at once, one for the focus and
one under the pointer (WCAG 2.1, success criterion 1.4.13).

A tooltip has one of two kinds:

- **`label`**, the default, repeats the name the control already has: the
  name of a rail item, of the theme toggle, of every `IconButton`, which
  brings its own. What it says has to be what the control is called to
  assistive technology, so that someone who speaks to the computer can say
  what they see (WCAG 2.1, success criterion 2.5.3). Assistive technology
  skips it.
- **`description`** says something the name does not: the reason a control
  cannot be used. It is tied to the control and read with it, whether the
  tooltip shows or not.

Where a tooltip may be used:

- On a control that takes the focus: a button, a link, an entry of a
  menu. Text, an icon or a badge cannot be reached by the keyboard, so
  what a tooltip would say about one is written out.
- On a disabled control only when it still takes the focus
  (`focusableWhenDisabled`, or `aria-disabled` on a native element). The
  native `disabled` attribute keeps every event from the control.
- For a few words. It holds no link and no control, and nothing the user
  has to read to use the page: a touch screen never shows it. The reason
  a control is disabled is the one thing that is said by a tooltip alone.
  A user of a touch screen sees that the control is disabled and not why
  ([0026](adr/0026-ui-primitives-on-base-ui.md) leaves that open); where
  the reason matters to the task, a view writes it out beside the control
  as well.
- `keys` shows the shortcut that does what the control does, as key caps
  beside the text, and only while that shortcut works.
- `disabled` switches it off while its owner shows the same words
  already, as an item of the full sidebar does.

Escape puts a tooltip away and does nothing else: with a tooltip showing
inside a dialog, the first Escape is the tooltip's and the second the
dialog's. A tooltip that is out of sight, because its control was
scrolled away, takes no key: Escape then closes the dialog at once.

### Dialogs, confirmations and the drawer

Which overlay for what:

- **`Dialog`** for a task the user finishes or dismisses before going on:
  a form that edits one thing, the command palette, the help. It is
  modal.
- **`ConfirmDialog`** before every change that is sent. It shows the
  request, its method, its path and its body, as text, and asks. A screen
  reader says the method and the path with the question when it opens. It
  is an alert dialog: a press outside does not answer it and leaves the
  focus where it is, Escape cancels, and the focus starts on Cancel, so
  that Enter pressed too soon sends nothing. `danger` marks a change that
  destroys, and `children` holds an
  input the confirmation needs, with `confirmDisabled` for as long as the
  input is not valid. It does not close itself: the caller sets `open` in
  `onConfirm` and `onCancel`.
- **`Drawer`** for the details of one thing out of a list: long, with
  tabs, and with the list still in sight beside it. Whether it is open
  belongs in the address ([State in the address](#state-in-the-address)),
  so that Back closes it and a link opens it; the primitive itself is
  controlled and knows no address. It is modal too. The header of the
  shell stays in sight above it and does not answer: a press on it closes
  the drawer, like a press on the scrim.
- **`Popover`** for something small that belongs to the control that
  opened it. It is not modal: the Tab key runs through it and on into the
  page, which closes it.
- **`Menu`** for actions. It holds entries and nothing else.

`Dialog` is controlled: `open` says whether it shows, and `onClose` is
called on Escape and on a press outside. Its content is `DialogHeader`,
which has the title that names the dialog, `DialogBody`, the part that
scrolls, and `DialogFooter` with the buttons, the one that carries on
last. `placement` is `top`, as the palette and the help hang, or `middle`,
as a confirmation stands; `className` is its width.

The rules they share:

- **The focus** goes in when an overlay opens, stays in while it is open
  and comes back to the control that had it. `initialFocus` names another
  start than the first control.
- **Everything behind is inert.** While a dialog, a confirmation or the
  drawer is open, the page behind it, and an overlay that lies under it,
  takes neither the focus nor a press and is hidden from assistive
  technology (`primitives/modal.ts`). Base UI hides the page and turns
  the Tab key round at the edges of the overlay, which holds only while
  the focus is inside: a press on the button of a toast, or the way
  through the browser's own controls, takes it out. The toasts stay in
  reach beside an open overlay, since they report what it did. Of two
  overlays that are open at once, the palette over a drawer, the one that
  closes lets go of what it alone held: the page stays out of reach until
  both have closed, whichever goes first.
- **A dialog is rendered by the component that owns what opens it**, so
  that it goes when that component does. A dialog of a view leaves with
  the view when the address changes, by the browser's Back or Forward,
  and the focus goes to the heading of the view that shows. Left open, it
  would lie over a view whose heading has the focus and is hidden from a
  screen reader. A dialog of the shell, the palette and the help, is
  closed by the shell for the same reason; the root address counts as
  the Overview it leads to, so one opened before the first view has
  arrived stays open when it does. An overlay opened from inside
  another, a confirmation from a drawer, is rendered inside the outer
  one's content, goes with it, and dims it as it dims the page.
- **Closed is closed at once.** A dialog is closed from the moment its
  `open` is false, though Base UI keeps it on the page until it has left:
  the keys of the page work again at once, and the focus is out of the
  dialog at once, so a key pressed right after Escape is not typed into a
  text field that is going. The page behind is in reach again in that
  same step: a field that arrives with it and takes the focus as it
  arrives is given the focus.
- **Its content is a shortcut scope of its own**, and the shortcuts of the
  page rest while it is open, as described under
  [Keyboard shortcuts](#keyboard-shortcuts).
- **A dialog is no higher than 76 % of the window, and scrolls inside.**
  Its head and its buttons stay, and the body between them scrolls. In a
  window lower than 480 px, which is what an enlarged page is, the body
  keeps at least 56 px, its padding and one field, and where the head and
  the buttons leave it less than that the dialog scrolls as a whole:
  nothing of it is cut off. The body of a confirmation shrinks further
  instead, so that the question and the buttons stay on the screen for as
  long as the two fit. A drawer is as high as the window below the
  header; in a window lower than 480 px the whole drawer scrolls as one,
  so that its header cannot take the room of its content. A part that
  scrolls is a stop of the Tab key while it has something to scroll
  (`layout/useKeyboardScroll.ts`), and is then a group with a name: the
  body of a dialog and of a drawer are named after it, the body of a long
  request "Body of the request". The drawer that scrolls as one is no
  stop: the Tab key goes to its controls, the close button first, and the
  keyboard scrolls it from there. It carries a `tabindex` of -1 to say so,
  since Firefox makes a stop of whatever scrolls and carries none.
- **What takes the keyboard focus is shown in full.** A browser scrolls to
  the control that takes the focus: Chromium and Safari whenever a part of
  it is out of sight, Firefox only when none of it is. So where a dialog,
  a drawer or the region of the toasts scrolls, a control that takes the
  focus while a part of it is cut off is scrolled into sight in full, by
  the least that shows it (`primitives/showInFull.ts`). That is for the
  focus the browser draws a ring for. A control of which nothing is in
  sight is left to the browser, which scrolls to it in every engine, and a
  press of the mouse on a button moves nothing.
- **No transform on a dialog.** What opens from inside a dialog is fixed
  to the window, and a transformed element would hold it and cut it off.

### Toasts

A toast says that something the user did has happened, or has not. Any
component inside the application shows one:

```tsx
const toast = useToast();
toast.show({ title: "Changes saved", detail: "POST /example 200" });
toast.show({ tone: "err", title: "Changes not saved", detail: "POST /example 500" });
```

`title` is a few words on what happened, `detail` a line set like code
with what was sent and what came back, and `tone` is `ok`, the default,
`info`, `warn` or `err`. `show` returns an id that `dismiss` takes.

- A toast takes no focus. It appears in one region, the landmark
  "Notifications", which announces politely: a screen reader reads a new
  toast when it next pauses (WCAG 2.1, success criterion 4.1.3). A
  failure is announced the same way.
- It stays five seconds, and a toast of the tone `err` until it is
  dismissed. The time stops while the pointer is over a toast, while the
  focus is in the region, and while the window is not the active one.
- The toasts stand in a column 18 px from the right and the bottom edge
  of the window, each no wider than 400 px. Their region reaches to those
  two edges and is wider and higher than the column, by the room the
  shadow of a toast takes: a region that scrolls cuts off what reaches
  beyond it. That room is the page's. A press beside a toast goes to what
  lies under it, and so does the wheel, and the ring the region has while
  `F6` has given it the focus runs around the room and along the two
  edges of the window. Where the toasts are higher than the window, the
  wheel over a toast and the keyboard scroll the region, and a toast that
  takes the focus, itself or its button, is brought into sight in full; a
  scroll bar of the region cannot be dragged, since the region lets the
  pointer through.
- A toast lies over whatever is at the bottom right of the window, and
  nothing moves it or the page out of the way. On a narrow screen it
  takes most of the width of the page, and the control that has the
  keyboard focus can be under it: for five seconds, and under a failure
  until the failure is dismissed. WCAG 2.2 asks that a control with the
  focus is never hidden entirely (success criterion 2.4.11). The target
  here is WCAG 2.1 AA, which has no such criterion, so this is left as it
  is and listed as open for the designer in
  [0026](adr/0026-ui-primitives-on-base-ui.md).
- `F6` moves the focus to the region, the Tab key goes on into a toast and
  to its Dismiss button, and Escape dismisses the toast that has the
  focus and does nothing else: a dialog that is open beside the toasts
  stays open. When the last one is gone, the focus is back where it was.
- No more than five show at once, the newest on top. A failure beyond
  those five waits out of sight, and shows again when a newer toast has
  gone. A toast with a time does not wait: its time runs on while newer
  ones cover it, and it is gone when its time is up, seen again or not.
- A drag over a toast selects its text and does not move the toast; its
  button and Escape dismiss it.
- A toast is for the result of an action. What is wrong with a field is
  the field's `error`, a question is a `ConfirmDialog`, and the state of
  the cluster is not a toast at all.

`primitives/PrimitivesProvider.tsx`, around the application, holds the
toasts and renders their region. A component test that renders a view
alone and shows a toast wraps it in that provider. A toast is a dialog
that is not modal, so a test that looks for a dialog names the one it
means.

### Popups and where they go

Base UI appends a popup to the end of the page, outside every landmark,
where a user who moves from one landmark to the next never comes by. So
every popup, a tooltip, a popover, a menu, the list of a select, goes
into a place that has been named for it (`primitives/popups.tsx`), fixed
to the window so that nothing around the place clips it:

- What opens from the page goes into the shell's place, at the end of the
  main region.
- What opens from inside a dialog or a drawer goes into a place inside
  that dialog or drawer.
- The tooltip of a toast's button goes into the region of the toasts.
- What opens from inside a popover or a menu lies beside it, in the same
  place.

A view does nothing for this: the primitives ask where they are. The
layers, lowest first, are the drawer, the popups of the page, the
dialogs, and the toasts over everything.

Base UI sets positions from its scripts, which the server's
Content-Security-Policy allows where it forbids a `style` attribute in the
markup ([0012](adr/0012-local-listener-security.md)). One part of Base UI
would also add a `<style>` element, which the policy refuses: the select
and `PrimitivesProvider` both tell Base UI to leave it out. A Base UI
part that is new to `primitives/` is read for such an element before it
is used, and exercised in the gallery, where the tests of the binary
would see the refusal.

### The gallery

`/gallery` shows every primitive, in every look and in every state that
can be held still, and behind a button where it is something that opens.
It is in the binary: the tests of the primitives run on it under the
server's Content-Security-Policy, and it is what the designer looks at.
The command palette leads to it ("Open the component gallery"), the
navigation does not, and it has no `g` key: it is a page with a title and
a heading like a view, and no row of the view table.

`gallery/page.ts` lists its sections, one for each primitive. The id of a
section is the id of its heading and the fragment of its address:
`/gallery#drawer` shows the drawer's section with the focus on its
heading. A new primitive adds its row there and its file under
`gallery/sections/`, with every variant, size and state, on a card and on
the page where its colours differ between the two. A new kind of overlay
also adds itself to the list in `web/e2e/gallery.ts`, which the scans, the
low windows and the check of the policy go through.

Its content is made up and neutral, "First option", "Save changes",
`POST /example`: nothing in it is shaped like a job, a node or an answer
of slurmrestd ([0016](adr/0016-e2e-and-fixtures-on-sind.md)). Nothing in
it is sent anywhere, and what it keeps, a chosen option, an open drawer,
is gone with a reload: the gallery shows the primitives, not how a view
keeps its state. It has one shortcut of its own, `l`, which presses the
toggle whose tooltip shows that key: a control names a key only when the
key does what the control does.

## Departures from the handoff

The handoff is [design/README.md](design/README.md) and the prototype
beside it. This section lists every place where the shell and the
primitives differ from it, one line each with its reason, for the designer
to accept or to change. A change that adds a departure adds its line here.

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

The primitives follow the same rule, and one more: what a control or a
state is known by, an icon, the boundary of a field, a dot, a tick, the
ring of the focus, stands 3:1 against what it lies on (WCAG 2.1, success
criterion 1.4.11). A button, a chip, a tab and an entry of a menu are
known by their text and keep the handoff's `--bd` as decoration (1.28,
1.20 on `--bg-surface`); a field is known by its boundary. No token has a
new value and none is added. The ratios are written to two places, light
theme then dark theme, without the ":1", because several stand close to
their least; `web/src/styles/pairs.test.ts` works each of them out from
the tokens and fails when one falls below it. A tint is translucent: its
ratios are worked out over the ground named.

| Where | The handoff | The primitives | Why |
| --- | --- | --- | --- |
| Primary button | white on `--ac`: 4.19, 2.75; under the pointer white on `--ac-l`: 5.75, 2.12 | `--bg-surface` on `--ac-l`: 5.54, 8.23; under the pointer brighter by 8 %: 5.09, 9.41; held down darker by 8 %: 5.24, 7.13 | White is no token, and the pair fails in both themes |
| Destructive primary button | white on `--err`: 3.76, 3.76 | `--bg-surface` on `--err-fg`: 6.23, 6.31; under the pointer 5.74, 6.77; held down 5.88, 5.50 | Fails in both themes |
| Soft destructive button | `--err-fg` on `--err-bg` over what lies behind: 5.01, 5.95 on the page; 4.43, 4.18 on a row under the pointer | the same tint over an opaque `--bg-surface`, whatever lies behind: 5.34, 5.39 | The tint is translucent, and fails on `--bg-hover` |
| Pressed icon button | a white icon on `--ac`: 4.19, 2.75 | `--bg-surface` on `--ac-l`: 5.54, 8.23 | An icon needs 3:1; fails in the dark theme |
| Text of a badge | the tone's `-fg` on its `-bg`: ok 4.30, 7.62 on a card and 3.60, 5.82 on a row under the pointer; org 4.34, 6.20 and 3.62, 4.77; err 4.43, 4.18, info 4.70, 4.19 and vio 4.86, 4.04 on such a row; accent 4.01, 4.68 | `--t1` on the same tint: at least 11.68, 9.19 on a card, the page and a row under the pointer. A neutral badge is `--t2` on `--bg-elevated`: 5.99, 11.11 | ok and org fail in the light theme everywhere, the others on a row under the pointer |
| Dot of a badge | the solid tone on the tint: ok 1.95, 5.83; warn 1.84, 6.15; org 2.35, 5.01; neutral `--t4` on `--bg-elevated` 2.10, 3.14 | the tone's `-fg`: ok 4.30, 7.62; warn 6.07, 7.91; err 5.34, 5.39; info 5.64, 5.44; vio 5.84, 5.24; org 4.34, 6.20; accent `--ac-t` 4.82, 6.13; neutral `--t3` 4.16, 7.55. The least on a row under the pointer is ok at 3.60 in the light theme and vio at 4.04 in the dark one | A dot that marks a state needs 3:1 |
| Dot of a toast | the solid tone on `--bg-surface`: `--ok` 2.19, 7.67; `--warn` 2.07, 8.13 | the tone's `-fg`: `--ok-fg` 4.83, 10.02; `--info-fg` 6.45, 6.87; `--warn-fg` 6.83, 10.46; `--err-fg` 6.23, 6.31 | The same |
| Count inside a chip | the label at an opacity of 0.75: 3.77, 7.50 on a chip that is off, 2.93, 4.54 on one that is on | the colour of the label, not dimmed: 6.85, 12.50 and 4.82, 6.13 | Fails in the light theme |
| Pressed chip | `--ac-t` on `--ac-m` over what lies behind: 4.52, 6.86 on the page, 4.26, 5.40 on `--bg-elevated`; a transparent border, and a tint that stands 1.15, 1.34 against what is around it | the tint over an opaque `--bg-surface`: 4.82, 6.13; and a border in `--ac`: 4.03, 6.36 against a card, 3.77, 6.94 against the page, 3.51, 4.73 against the chip | The text fails on `--bg-elevated`, and nothing marked the state at 3:1 |
| Segment that is not chosen | `--t3` on `--bg-elevated`: 4.16, 7.55 | `--t2`: 5.99, 11.11 | Fails in the light theme |
| Chosen segment | `--bg-surface` on a track in `--bg-elevated`, 1.14, 1.13, and a shadow | the same, and a border in `--ac`: 3.52, 5.65 against the track, 4.03, 6.36 against the segment | Nothing marked the state at 3:1 |
| Tab that is not active | `--t3`: 4.75, 8.50 on a card, which is where the handoff's one row of tabs stands, in the drawer; 4.44, 9.28 on the page | `--t2`: 6.85, 12.50 and 6.40, 13.64 | The handoff's pair passes where the handoff draws it. On the page, where tabs may stand here, it fails in the light theme |
| Label and description of a field | `--t3`: 4.75, 8.50 on a card, which is where every label of the handoff stands; 4.44, 9.28 on the page | `--t2`: 6.85, 12.50 on a card and 6.40, 13.64 on the page | The handoff's pair passes where the handoff draws it. On the page, where a field may stand here, it fails in the light theme |
| Placeholder of a field and of a select | not set; `--t3` on `--bg-elevated` would be 4.16, 7.55 | `--t2`: 5.99, 11.11, and 6.85, 12.50 on the fill of a surface | A placeholder is text |
| Boundary of a field and of a select | `--bd` on `--bg-elevated`: 1.12, 1.07; the fill against a card 1.14, 1.13 | `--t3`: 4.16, 7.55 against the field, 4.75, 8.50 against a card, 4.44, 9.28 against the page | An empty field is known by its boundary alone |
| Field that cannot be edited | text `--t3` on `--bg-base`: 4.44, 9.28; a lock in `--t4`: 2.41, 3.53 on a card | text `--t2`: 6.40, 13.64; a lock in `--t3`: 4.75, 8.50 on a card, 4.44, 9.28 on the page | Fails in the light theme |
| Text at the end of a menu entry | `--t3` on `--bg-hover` in the marked entry: 3.89, 6.49 | `--t2`: 5.61, 9.54, and 6.85, 12.50 on `--bg-surface` | Fails in the light theme, as in the palette |
| Chosen entry of a choice in a menu, chosen option of a select | the hover background and a tick; the handoff's select is the native one | the tick alone, in `--ac-t`: 5.54, 8.23 on `--bg-surface`, 4.54, 6.28 on the marked entry | The hover background marks where the focus is, and cannot say two things |
| A control that is disabled and can still have the focus | the whole control at an opacity of 0.45, and with it the ring of the focus: 1.95, 2.70 on `--bg-surface`, 1.83, 2.47 on `--bg-hover` | the control dims what it holds and not itself, and a filled one lets its fill through by the same measure; the ring stays at 5.54, 8.23 and 4.54, 6.28. The text of a filled button is then dimmed on a fill that is dimmed too, and stands 1.38, 1.62 against it, where the handoff's stands 1.78, 1.93 | The ring has to stand 3:1 on a control the keyboard reaches: a button disabled with a reason, an option, a tab, an entry of a menu. A disabled control is exempt from the contrast of its text |
| Ring of the focus on a dialog, a drawer, a popover and a part that scrolls | no ring | drawn inside the edge, on `--bg-surface`: 5.54, 8.23 | Outside it would lie on the scrim, where `--focus` reaches 2.86 in the light theme |

Kept from the handoff, with their ratios: a text button in `--ac-t` (5.54,
8.23 on a card; 5.17, 8.99 on the page; 4.54, 6.28 on `--bg-hover`; not
for `--bg-active`, where it is 4.17 in the light theme); destructive text
in `--err-fg` (6.23, 6.31 on a card; 5.82, 6.89 on the page; 5.10, 4.82 on
`--bg-hover`); the line under the active tab in `--ac` (4.03, 6.36 on a
card; 3.77, 6.94 on the page); the boundary of an invalid field in `--err`
(3.17, 4.13 against the field; 3.62, 4.64 against a card; 3.39, 5.07
against the page); the method of a request on `--bg-base`, `--info-fg`
6.03, 7.50, `--ok-fg` 4.51, 10.94 and `--err-fg` 5.82, 6.89, with its path
and body in `--t2` (6.40, 13.64); and `--t3` on `--bg-surface` (4.75,
8.50) for the heading of a group in a menu, the second line of a toast,
the lines above and below the title of a drawer and the note in the foot
of a dialog. `--ok-fg` passes on `--bg-base` by a hair: the request lies
on that background and on nothing darker.

### Look and wording

| Where | The handoff | The shell | Why |
| --- | --- | --- | --- |
| The keyboard focus | No ring; the prototype removes outlines | A 2 px ring in sdash's own token `--focus` | A keyboard user has to see where the focus is (WCAG 2.1, 2.4.7) |
| Tooltips | The native `title` attribute | The `Tooltip` primitive: after 300 ms under the pointer and at once on keyboard focus; Escape puts it away, and the pointer can move onto it | A `title` is out of reach of the keyboard and of Escape (WCAG 2.1, 1.4.13) |
| The name of a rail item | A `title` at the pointer | A tooltip beside the link, 6 px from it, level with the icon and over the start of the main region | It is where the popups of the page go, which the sidebar does not clip |
| A tooltip whose control moves | Not drawn | Follows its control when the rail scrolls or the window changes size, and goes once the control is scrolled out of sight | Left behind it would name another item; put away it would be lost to someone who enlarges the page to read it |
| The theme toggle | Tooltip "Toggle theme (t)" | Tooltip "Dark theme" with `t` as a key cap | The tooltip is the name of the toggle, which is pressed or not (WCAG 2.1, 2.5.3) |
| The search button | "Search jobs, nodes, views…" | "Search views and actions" | The palette finds no jobs and no nodes yet |
| The palette's placeholder | "Jump to a view, job id, node, user…" | "Go to a view or run an action" | The same |
| The kind of a palette entry | A column in every row | A heading above the entries of the kind | A screen reader says the kind once, as the name of the group |
| The keys beside a palette entry | Plain text in DM Mono | Bordered key caps | One component draws every shortcut, in the header, the help and the palette |
| The palette's "esc" | A key cap that does nothing | A button, named "Esc to close" | Whoever uses a pointer or a touch screen needs a way to close it |
| The palette's footer | "↵ open", "g + key jumps to a view", "t toggles theme" | "The arrow keys move through the list, Enter chooses, Escape closes." | It names the keys of the palette; those of the shell are in the help |
| The palette with nothing found | "No matches" | "No view or action matches." | It says what was looked for |
| The palette's actions | "Toggle theme" | "Switch to the dark theme", the sidebar, the help, the switch for single-key shortcuts, and "Open the component gallery" | The palette has to offer what the single-key shortcuts do (WCAG 2.1, 2.1.4), and it is the one way to the gallery |
| The height of the palette | As high as its list, up to 380 px for the list | At most 76 % of the window, like the help; the marked entry keeps 6 px from the edge it is scrolled to | In a low window, which an enlarged page is, all of it has to stay on the screen |
| A contrast theme of the system | Not drawn | The current link has a 2 px border and the marked palette entry a 2 px outline, in the system's colours | `forced-colors` replaces the backgrounds that show both states; a border for the link, so that the focus ring stays apart from it |
| A narrow screen | Not drawn | Below 768 px the rail, with no button to expand it; below 640 px the search button is its icon and the cluster switcher its light and arrow | Reflow at 320 px (WCAG 2.1, 1.4.10) |
| The name beside the mark | Always shown | Below 360 px left to assistive technology | At 320 px the theme toggle would be cut off |
| A view that failed | Not drawn | A report in the main region, "This view did not load" or "This view failed", with a button to reload | A view is a file of its own that can fail to arrive; the second wording has not been reviewed |
| An address of no view | Not drawn | The not-found view: the address, and a link to the Overview | Views have addresses |
| The sizes | In px | In rem, the handoff's sizes at the default font size | They follow a user who has set a larger font |

| Where | The handoff | The primitives | Why |
| --- | --- | --- | --- |
| The heights of controls | Eight, between 20 and 36 px: 26, 28 and 30 px for controls of one kind | Four: 24, 28, 32 and 36 px. A toolbar is 2 px higher than drawn and the buttons of a dialog 2 px lower | One scale, so that a button, a field and a chip of one size stand level |
| A segmented control | Two. On the page, segments 28 px high in a track of 34 px with a border in `--bd`; in the status popover, segments 20 px high in a track of 24 px without a border | `md`: segments 28 px high in a track of 32 px, whose border in `--bd` takes one of the 2 px the track has around its segments. `sm`: segments 24 px high in a track of 28 px without a border | The scale: the control stands level with a button of its size, so the one on the page is 2 px lower than drawn; and a segment 20 px high is harder to hit than any other control |
| A chip | 30 px high | 28 or 32 px | The scale |
| A select | The native element | Base UI's select: a field, and a list in the tokens of both themes that opens below it | The native list looks different in every browser and has no dark theme of sdash's |
| The position of a tooltip | The browser's, at the pointer | Centred below its control, or on the side it is told; the reason of the cluster switcher starts at the left edge of its button | A sentence is read from its start; a name belongs to the middle of its icon |
| The reason a control is disabled, on a touch screen | Not drawn | Not shown: the reason is a tooltip, and a tooltip opens for a pointer that can rest and for the keyboard | Base UI's tooltip has no press and hold. Everything else a tooltip says is the name its control has anyway; this is the one text a touch user does not get, and it is open for the maintainer |
| Two tooltips at once | Not possible | One for the keyboard focus and one under the pointer show together; the one of the focus also stays when the pointer passes over its control and leaves | Each stays for as long as its own cause does (WCAG 2.1, 1.4.13). Base UI shows one tooltip at a time, with or without its provider, and closes one when the pointer leaves its control, whatever the focus is on: the tooltip keeps itself open against both |
| A disabled button under the pointer | Its hover look, dimmed with the rest | No answer to the pointer | The button itself is not dimmed, and a hover look at full strength would say that it works |
| A disabled control with a reason | Not drawn | It keeps its place in the order of the Tab key, says that it is disabled, and shows the reason as a tooltip that describes it | The reason has to be reachable without a pointer |
| A text field the browser finds wrong | Not drawn | Where the caller gives no error, the field shows the browser's own message once Enter is pressed | The field is never marked invalid without a text that says why. What the browser itself tells assistive technology of such a value before Enter, Chromium says "invalid" at once, is not the field's doing |
| The text of an error | Not drawn | It appears in a place below the field that is there from the start and announces it | It describes the field, and a description is read on arriving at the field, not when it changes (WCAG 2.1, 4.1.3) |
| A row of tabs or segments that is too long | Not drawn | It goes on in a second line | Reflow at 320 px (WCAG 2.1, 1.4.10) |
| A popover | The status popover opens under the pointer and is pinned by a click | A popover opens on a press | A panel that holds controls must not come and go with the pointer; the status popover itself is not built yet |
| A menu | 220 and 300 px wide | As wide as its entries, and at least 176 px | The width follows the content; a caller can set one |
| A confirmation | A dialog like any other; the request 18 px below the text, or an input 14 px below the text and the request 14 px below the input | An alert dialog; the request lies in the part that scrolls, 16 px below the text, or an input 16 px below the text and the request 12 px below the input | It asks a question that has to be answered; in a low window the question and the buttons have to stay on the screen while the request scrolls |
| The buttons of a dialog | In one row; Cancel 34 px high at a weight of 400 with 14 px of padding at its sides, the button that carries on with 16 px | They go on in a second line where they do not fit. Both are 32 px high with 12 px at their sides, and Cancel has the weight of 500 every secondary button has | Reflow at 320 px (WCAG 2.1, 1.4.10); the sizes and the looks are one set |
| A dialog in a low window | Not drawn | Below a height of 480 px its body keeps at least 56 px, and the dialog scrolls as a whole where its head and its buttons leave less. A confirmation lets its body shrink instead | The head and the buttons of a dialog can be higher together than the dialog may be, and what did not fit was cut off for good |
| The close button of the drawer | An icon button 30 px wide with the `title` "Close (Esc)" | An icon button 32 px wide named "Close", whose tooltip shows the name and the key | The scale, and a tooltip the keyboard reaches |
| The header of the drawer | A button beside the close button ("Open job page"); actions 30 px high | No place beside the close button yet; actions 32 px high | The scale; the button waits for the view that needs it |
| A drawer in a low window | Not drawn | Below a height of 480 px the whole drawer scrolls as one, the header with the content | The header would leave the content no room on an enlarged page |
| The drawer and a toast appearing | At once, without motion | The drawer slides in from the right in 300 ms while its scrim fades in, and a toast fades in 150 ms, on the handoff's one easing; none of it for a user who asked for less motion | So that the eye sees where a panel came from that covers a third of the window. The time and the easing are those the handoff has for the sidebar; the motion itself is for the designer to accept or to take out |
| A toast | A dot, a title and a line | The same, and a button "Dismiss" | A toast that stays has to be dismissable, by keyboard too |
| The order of toasts | The newest at the bottom | The newest on top; no more than five show. A failure beyond five waits, and a toast with a time is gone when its time is up, seen again or not | The Tab key reaches the newest first, and a toast that arrives moves none that is there |
| A drag over a toast | Not drawn | Selects its text; the toast does not move | Base UI swipes a toast away under a dragged pointer, and the toast has a button for that |
| One long word in a toast or a tooltip | Not drawn | Breaks where the toast or the tooltip ends | A path or an id is one word, and ran out of the toast and of the window |
| The toasts in a low window | Not drawn | Their region is no higher than the window and scrolls | A toast above the edge of the window could be neither read nor dismissed |
| A toast on a narrow screen | Not drawn | At the handoff's place, 18 px from the right and the bottom edge, where it takes most of the width of the page and can lie over the control that has the keyboard focus: for five seconds, and a failure until it is dismissed | The handoff has one place for a toast. WCAG 2.2 asks that a control with the focus is never hidden entirely (2.4.11); the target is WCAG 2.1 AA, which does not, so nothing was changed, and it is open for the designer |
| Heights that follow from the text | The line of the prototype is the font's own, about 1.3 times the size of the text | The line of the page is 1.5 times the size of the text. An entry of a menu and an option of a select are 32.75 px high where the handoff has 30, a toast with two lines 59.25 against 55, the title of a dialog 24 against 21 and the title of the drawer 28 against 24. A badge has the handoff's line and is 19 px high, and 16 in its small size where the handoff has 15 | The line height of the page is the shell's; the badge stands in the dense rows of a table, where every pixel is a row's. The others are for the designer to decide |
| Looks under the pointer | A soft destructive button is brighter by 8 %; a chip that is off, a segment and a tab that are not chosen do not change; an icon button gets `--bg-hover` and keeps its icon in `--t2`; a text button does not change; a disabled control keeps the pointer's hand | The soft destructive button gets a border in `--err-fg`; a chip that is off gets `--bg-hover` and `--t1`; a segment and a tab that are not chosen get `--t1`; the icon of an icon button gets `--t1`; a text button is underlined; a secondary button held down gets `--bg-active`; a disabled control shows that it cannot be pressed, and an entry of a menu the arrow | Each control says under the pointer that it can be pressed; none of it bears on a criterion, and all of it is for the designer to accept or to change |
| Smaller differences of type and shape | Secondary buttons at a weight of 400 on their 32 and 34 px sizes and 500 on most smaller ones; a badge in the monospaced font at 11 px and 400; the arrow of a select and of a button that opens a menu 11 and 12 px wide; a field with an icon with a radius of 6 px | Every secondary button at 500; a badge in the monospaced font at 11.5 px and 500; the arrows 14 px wide; a field with an icon with the radius of every field, 5 px | One set of looks and sizes, where the handoff varies them from place to place |
| An icon with a colour of its own, under a contrast theme of the system | Not drawn | The tick of a chosen option, the arrow of a select, the lock and the icon of a field take the colour of the text | They kept the colour of the token, of the theme stored in sdash, while the text took the system's: with a dark theme stored and a light contrast theme the tick, which alone marks the chosen option, stood 2.12 against the system's white (WCAG 2.1, 1.4.11) |
| The gallery | None | A page at `/gallery` that shows every primitive in every state | The tests need each primitive in a real page under the server's policy, and the designer needs to see them |

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

| Where | The handoff | The primitives | Why |
| --- | --- | --- | --- |
| Escape with a tooltip showing | No tooltips of its own | Puts the tooltip away and nothing else; the next Escape closes the dialog, the drawer or the popover the control is in. A tooltip that is out of sight with its control takes no key | Content that appears on hover or focus has to be dismissable without moving either (WCAG 2.1, 1.4.13) |
| Escape with the focus on a toast | Not drawn | Dismisses that toast and nothing else: a dialog or a drawer that is open beside it stays open | The key was meant for a message; a form would be lost and a confirmation cancelled by it |
| Keys while a popover, a menu or the list of a select is open | The same keys as without one | The shortcuts of the page rest, as behind a dialog | The focus is on a control inside, and a letter typed there would switch the theme |
| A letter typed on a closed select | The native select chooses by it | The same, and the letter is no shortcut of the page | Base UI lets the key go on to the page |
| An option, a tab or an entry that is disabled | Not drawn | The arrow keys stop on it; it says that it is disabled and does nothing | Base UI's behaviour, and what the WAI-ARIA practices recommend for a menu: a user of a screen reader learns that it exists |
| A segmented control | Buttons | A radio group: one stop of the Tab key, and the arrow keys move the choice | One option is always chosen, which is what a radio group says |
| Tabs | Buttons | A tab list: one stop of the Tab key, the arrow keys move and select at once, and the panel is the next stop | The WAI-ARIA pattern, with the selection following the focus because a panel shows without delay |
| A chip | A button | A toggle button, which says whether it is pressed | The state has to reach assistive technology |
| A press outside a confirmation | Cancels it | Does nothing, and leaves the focus where it is; Cancel and Escape answer it, and the focus starts on Cancel | An alert dialog asks a question; Enter pressed too soon must send nothing |
| The drawer | A layer beside the page | Modal: the focus goes in, stays in and comes back, and the header of the shell does not answer while it is open: a press on it closes the drawer. On a touch screen a swipe to the right closes it | As for the dialogs |
| What lies behind a dialog, a confirmation or the drawer | In reach of the pointer and of the keyboard | Inert: it takes no focus and no press and is hidden from assistive technology. The toasts stay in reach | The focus gets out of an overlay by a press on the button of a toast and by way of the browser's own controls, and the Tab key then walked the controls behind the scrim |
| A drawer opened by the keyboard | No focus | The focus is on the drawer itself | A screen reader reads its name and starts at its top |
| How long a toast stays | 3.8 s, whatever it says | 5 s, and a failure until it is dismissed; the time stops under the pointer, with the focus in the region, and in a window that is not the active one | A limit the user cannot stop fails WCAG 2.1, 2.2.1, and a failure must not be missed |
| How a toast is announced | Not at all | In a region that announces politely, a landmark named "Notifications"; `F6` moves the focus there | A status message has to reach a screen reader without taking the focus (WCAG 2.1, 4.1.3) |
| The title of a toast | A line of text | The same, and no heading | A toast comes and goes, and must not come and go in the outline of the page |
| Popups | At the end of the page | Inside the main region, and inside the dialog or the drawer they open from | Content in no landmark is passed over by a user who moves from one to the next |

### Not built yet

These are parts of the handoff's shell that wait for a cluster
([0016](adr/0016-e2e-and-fixtures-on-sind.md)), and no departures: the
refresh control, the pill with the user's role and the avatar in the
header; the states of the status pill and its popover, in whose place it
says "No cluster"; the cluster switcher's name, version and menu, in whose
place it is disabled with its reason as a tooltip; the count beside an
item of the navigation; the API hint beside a page's heading; jobs and
nodes in the palette.

Of the primitives, this change has the controls and the overlays. What
shows data, the cards, the meters, the bars and the tables, is not built
yet, and neither are the handoff's editor dialog and its popover that
opens under the pointer, which wait for the views that use them. Five
things the handoff draws for these primitives cannot be built from them
yet, and wait for the same views: a pill with an icon, as the role pill
has one; the 26 px chip of a legend, with a swatch of its colour; a line
of text below the entries of a menu; a field that shows it was changed,
with a boundary in the accent and what it was before; and a button beside
the close button of the drawer.

## Tests

The view table has a unit test, and so have the shortcut matching, the
registry's report of a shortcut registered twice, the palette's scoring,
the query-string helper and the shell's commands. Two unit tests read the
sources and the tokens: `conventions.test.ts` holds that nothing outside
`primitives/` imports Base UI and that no file has a `title` on an
element, a `style` or a colour that is no token, and
`styles/pairs.test.ts` holds every pair of tokens the primitives use to
its least contrast.

The component tests of the shell render the whole application with
`renderApp` from `testing/app.tsx`; `routing/arrival.browser.test.tsx` has
views of its own, so that it decides when the file of a view arrives and
whether it does. Each primitive has a component test beside it, which
renders it alone and uses it by its role and its name, in both themes
where a colour matters and under a contrast theme of the system
(`testing/system.ts`). A component test has no shell around the
primitive: what a primitive does to the page it is on, the header under a
drawer, the page behind a dialog, the window that must not scroll, is
tested in the binary as well.

The Playwright tests in `web/e2e/` visit every row of the view table, and
the gallery with them: `shell.spec.ts` for the landmarks, the addresses of
no view and the layout, at 360 and at 320 px too, `navigation.spec.ts` for
the ways between views, the browser's history and the arrivals that do not
go well, `keyboard.spec.ts` for the other shortcuts and the stored
preferences, `accessibility.spec.ts` for the axe scan of every view in
both themes and with the sidebar in both forms, and
`zoom-and-contrast.spec.ts` for an enlarged page and a contrast theme of
the system. `gallery.spec.ts` uses every control and every overlay of the
gallery by the keyboard alone, under the server's
Content-Security-Policy, scans the gallery with each kind of overlay
open, and tries with the pointer what lies behind an open overlay. [testing.md](testing.md) says how each layer is run.
