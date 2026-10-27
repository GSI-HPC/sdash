<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0030: The primitives that show data

Status: proposed

## Context

[0029](0029-ui-primitives-on-base-ui.md) built the controls and the
overlays, and left what shows data to a later change. Every view of a
cluster needs it: panels that hold a figure or a list, bars of how much is
used, the parts of a whole, a line over time, a dense map of many small
things, and the states of a panel that has nothing to show yet, nothing at
all, or a failure. The handoff draws them on the Overview, the Nodes view,
the Partitions view, the job page and in its banners.

Three things constrain how. The server's Content-Security-Policy allows no
`style` attribute in the markup ([0012](0012-local-listener-security.md)),
and a bar whose length is a value cannot be a class: there is one length
for every value. The handoff fills parts of graphics with the solid status
colours, of which `--ok` stands 2.2:1 on a card in the light theme, below
the 3:1 WCAG 2.1 asks of a part of a graphic (success criterion 1.4.11),
and the designer has said to keep the values of the colours for now. And a
map of a few thousand cells, each a stop of the Tab key, would be a wall
for whoever moves by the keyboard.

This record covers Card, StatCard, KVList, Meter, StackedBar with its
Legend, Sparkline, CellGrid, EmptyState, Skeleton, ErrorPanel and Banner.
Tables, sortable, virtual or a tree, are a later change. No data of a
cluster is shown yet ([0016](0016-e2e-and-fixtures-on-sind.md)): these
primitives are built and tested with made-up content in the gallery.

The record was written with the change that builds these primitives, while
the maintainer was away. He has not seen it: it states a position, and
merging that change does not accept it.

## Decision

How a graphic is drawn:

- A length that is data is an SVG geometry attribute in percent: a `rect`
  with `width="37.5%"` inside an `svg` as wide as its box. No style
  attribute, no custom property set from a script, no measuring.
- A graphic is drawn in SVG with tokens as classes, and is hidden from
  assistive technology, which is told the same in words: a meter is a
  `meter` with its range and its value in words, a stacked bar is a group
  whose legend lists every part with its value, a sparkline is an image
  whose text gives the number of values, the first, the last, the lowest
  and the highest. A value is also on the page in text beside its graphic,
  except where a figure beside it says the same, as on a stat card.
- No chart library: four small components are less than one dependency.

Colours of graphics, with the values of the tokens untouched and no token
added:

- A part takes the text colour of its tone (`--ok-fg`, `--warn-fg`), which
  stands at least 3:1 against a card and against the track of a bar in
  both themes; the accent stays `--ac`, and a neutral part is `--t3`.
- The track of a bar is `--bg-elevated`, 1.1:1 against a card, and is
  decoration: a value is never read off the track.
- Neighbouring parts of a stacked bar are kept apart by the handoff's 1 px
  gap in the colour of the track, so no two parts have to differ from each
  other by colour.
- A meter with thresholds draws a mark across its track at each, and turns
  to the colour of the mark its value passed; its value in words names the
  mark. The mark says by position what the colour says.
- Where the system forces its colours a part is drawn in the colour of
  text, a track in the colour of the canvas with an outline, and the gaps,
  the marks and the text tell the parts apart.

The cell grid:

- It is a `grid` of rows of `gridcell`s, laid out in as many columns as
  fit, measured again when its width changes, so that its rows are the
  rows one sees and Up and Down go to the cell above and below.
- It is one stop of the Tab key. The arrow keys move the focus from cell
  to cell and stop at the edges, Home and End go to the ends of the row
  and with Control to the first and the last cell, Enter and Space press
  the cell. The focus stays on the grid and `aria-activedescendant` names
  the cell, whose name is its label, the word of its tone and its detail.
  The ring of the focus is drawn on the cell.
- It has one tooltip of its own, not one for each cell: it shows the
  label, the tone and the detail beside the cell, fixed to the window in
  the place for popups of [0029](0029-ui-primitives-on-base-ui.md) and
  hidden from assistive technology, which has the same words as the name.
  It comes at once to the cell the keyboard moves to, and to the cell the
  pointer rests on after 300 ms, as every tooltip. Whichever moved last
  owns it; a pointer that did not move takes nothing. Escape puts it away
  and nothing else, the pointer can cross the cells between a cell and its
  tooltip and move onto it, and a touch on a cell shows its tooltip, a
  second one presses the cell.
- The legend below the grid names each tone and says how many cells have
  it.

The panels:

- Card and StatCard are regions named by their headings, at the level the
  view gives them. KVList is a description list. The text of a panel that
  lies only on a card keeps the handoff's `--t3`, at 4.7:1 there; that of
  a panel that also lies on the page, an empty state, a skeleton, an error
  panel, is `--t1` or `--t2`.
- A skeleton is still, with the word "Loading…" on the page as a status and
  its grey lines hidden from assistive technology.
- An error panel says what failed, what to do, the error in DM Mono and
  offers a button that tries again; it is an alert only when asked, for a
  failure that comes after the page showed. It has no tint.
- A banner is an alert for a failure and a status for the other tones,
  put on the page empty and filled before it is drawn, so that a screen
  reader hears its text arrive. When it is dismissed with the focus inside
  it, it hands the focus to the first element after it that the Tab key
  stops on, or else to the heading of the view; in a dialog it looks no
  further than the dialog and falls back to the dialog.
- The placeholder card of the shell's views is a Card with an EmptyState,
  and the report of a view that failed reloads with the Button.

[ui.md](../ui.md#showing-data) describes the result for whoever builds a
view, and lists every departure from the handoff.

## Why

- SVG lengths in percent need no script and no measuring, hold at every
  width and zoom in every engine, and are attributes, which the policy
  allows. A custom property set from a script would be allowed too, but
  needs an effect for every bar and shows nothing before the script ran.
- A graphic says nothing a screen reader can read, and colour says nothing
  to whoever does not see it (WCAG 2.1, success criteria 1.1.1 and 1.4.1).
  The words go where a reader looks for them: on the element with the role.
- The solid tones fail 3:1 in the light theme. The text colours of the
  tones are what the badges and the toasts of
  [0029](0029-ui-primitives-on-base-ui.md) already use for their dots, so
  a state has one colour across sdash.
- A grid of thousands of cells as stops of the Tab key cannot be passed by
  the keyboard. One stop with the arrow keys is the WAI-ARIA grid pattern,
  and `aria-activedescendant` keeps the focus on one element, so a move
  redraws two rows and not the grid.
- One tooltip for a grid is one element, where Base UI's tooltip would be
  one root for each cell, a few thousand of them. Base UI's tooltip has no
  anchor that moves from cell to cell that it documents.
- When the page scrolls under a pointer that stands still, the browser
  reports the pointer over another cell. A tooltip that followed would
  take the keyboard's away, for no move of the user.
- A shimmer says nothing a word does not, keeps moving for as long as the
  wait lasts, and would have to stop for whoever asks for less motion. The
  handoff draws no skeleton.
- A banner's button goes with the banner, and the browser then puts the
  focus on the body, from where the next Tab starts at the top of the page.

## Costs

- A graphic cannot be styled with a percentage from a stylesheet; whatever
  a new graphic shows has to be an SVG attribute or text.
- The colours of the parts of graphics are darker in the light theme than
  drawn, and the marks of a meter are new. Each is a departure the
  designer may want to answer with a change of the tokens instead.
- The cell grid's tooltip is written beside `Tooltip`, with the same delay,
  the same look and the same Escape, and both have to be kept in step. It
  places itself from a script, through the CSS object model, and follows
  scrolling and a change of the window's size by listening for both.
- The grid measures its width and lays itself out again when it changes;
  a change of the root font size alone is seen at the next change of
  width.
- In a contrast theme of the system the cells of a grid all look alike,
  and only the tooltip and the names tell them apart.
- DM Sans as bundled has no figures of one width, so a figure that changes
  shifts the text after it a little. The meter on one line sets its value
  in DM Mono for that reason.
- The gallery shows the grid of 4,000 cells behind a button, so that the
  scans and the role queries of every gallery test do not walk its cells.
- Open for the maintainer, with the choice taken here: the text colours of
  the tones for graphics; the track at 1.1:1 as decoration; marks on a
  meter with thresholds; a still skeleton with a visible word; an error
  panel without a tint; one tooltip for a grid, which the later of the
  pointer and the keyboard owns; where the focus goes after a banner. No
  screen reader was heard: what one says for a meter, a cell of the grid
  and a legend in Safari, which drops the list role of a list without
  markers, is to be listened to.
