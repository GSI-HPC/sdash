<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0026: The UI primitives, on Base UI

Status: proposed

## Context

[0013](0013-frontend-stack.md) names Base UI for the primitives behind
dialogs, menus and tooltips, and [0014](0014-accessibility-and-browsers.md)
sets WCAG 2.1 AA with an axe scan in CI. The shell
([0024](0024-addresses-and-keyboard-in-the-shell.md)) brought one of them,
the modal dialog, and a stand-in for a tooltip. Every view that follows
needs buttons, fields, tabs, menus, dialogs, a drawer and toasts, and none
of the three records says where such components live, how a view chooses
their look, or what each is to assistive technology.

The design handoff draws these controls and overlays as styled `div`s and
`button`s. They have no roles and no handling of the focus, their tooltips
are the native `title` attribute, and several of the pairs of colours they
set are below the contrast WCAG 2.1 AA asks for: white on the accent, the
tone's own colour as the text of a badge, a field known by a border at
1.1:1. The designer has said to keep the values of the colours for now.

The server sends a Content-Security-Policy that allows no inline script,
no `<style>` element and no `style` attribute in the markup
([0012](0012-local-listener-security.md)). A style that a script sets is
allowed. Base UI positions what floats from its scripts, and one of its
parts adds a `<style>` element.

This record covers the first set, the controls and the overlays: Button,
IconButton, Badge, Chip, Kbd, Input, Select, SegmentedControl, Tabs,
Tooltip, Popover, Menu, Dialog, ConfirmDialog, Drawer and Toast. What
shows data, cards, meters and tables, is a later change.

The record was written with the change that builds these primitives, while
the maintainer was away. He has not seen it: it states a position, and
merging that change does not accept it.

## Decision

Where the primitives live and how a look is chosen:

- The primitives are in one directory, `web/src/primitives/`, one file for
  each, with named exports and no file that gathers them. It is the one
  directory that imports Base UI, and a unit test fails when another does.
  A primitive takes from the rest of the application the icons, the
  shortcuts and the hook that makes a scrolling region a stop of the Tab
  key, and nothing else.
- A look is chosen by props, `variant`, `tone` and `size`, each a fixed
  set. `className` is for the layout around a primitive alone, and no
  primitive takes a `style`. There is no dependency that merges classes.
  The title, the description and the close button of a dialog and the
  close button of a popover are the exception: they are Base UI's parts
  handed through, for a dialog that lays itself out, as the palette does.
- A control has one of four heights, 24, 28, 32 and 36 px, where the
  handoff has eight between 20 and 36 px.

Contrast, with the values of the tokens untouched and no token added:

- Text stands 4.5:1 against what it lies on, always.
- 3:1 is asked of what a control or a state is known by: an icon, a dot, a
  tick, the ring of the focus, and a boundary where the boundary is all
  there is, which is the case for a field. A button, a chip, a tab and an
  entry of a menu are known by their text and keep the handoff's border.
  A state that a fill alone showed gets a border or a line at 3:1.
- Where a pair of the handoff fails, another existing token is used, and
  [ui.md](../ui.md#colours) lists the pair with its ratios in both
  themes. A unit test works every pair the primitives use out of the
  tokens and holds it to its least.
- A control that is disabled and can still have the focus dims what it
  holds and not itself, so that the ring of the focus keeps its strength.

What each primitive is to the keyboard and to assistive technology:

- A segmented control is a radio group, tabs select the tab the focus
  arrives on, a chip is a toggle button, and a select is Base UI's, a
  combobox that only selects, and not the native element.
- An option, a tab or an entry of a menu that is disabled stays in reach
  of the arrow keys, says that it is disabled and does nothing.
- A button that is disabled with a reason to give keeps its place in the
  order of the Tab key and carries the reason as a tooltip.
- An overlay that takes the focus, a dialog, a drawer, a popover, a menu
  or the open list of a select, rests the shortcuts of the page for as
  long as it is open, by the rule the shell has for a dialog.

The tooltip, which replaces the shell's stand-in:

- It has two kinds. A label repeats the name of its control and is hidden
  from assistive technology. A description says what the name does not,
  is tied to its control and can be read whether it shows or not.
- It shows after 300 ms under the pointer and at once on the focus of the
  keyboard, and not for touch input. Escape puts it away and does nothing
  else, also inside a dialog; one that is out of sight with its control
  takes no key.
- A tooltip stays for as long as its own cause does. Base UI shows one
  tooltip at a time, and closes one when the pointer leaves its control:
  the tooltip refuses both while the keyboard focus is on its control,
  and the first while the pointer rests on it. So one for the focus and
  one under the pointer can show together.

Dialogs, the confirmation and the drawer:

- A dialog hangs near the top of the window or stands in its middle, is no
  higher than 76 % of the window and scrolls inside. In a low window its
  body keeps room for one field, and the dialog scrolls as a whole where
  its head and its buttons leave less. It is rendered by the component
  that owns what opens it, and goes with that component.
- A confirmation is an alert dialog that shows the request about to be
  sent: its method, its path and its body, as text. The method and the
  path are part of what describes it. A press outside does not answer it
  and does not take the focus, and the focus starts on the button that
  cancels.
- The drawer is modal, built on Base UI's drawer, and lies below the
  header of the shell, which stays in sight and does not answer while the
  drawer is open: a press on it closes the drawer.
- Everything outside an open dialog, confirmation or drawer is inert, by
  the primitives' own doing and beyond what Base UI does: it takes no
  focus and no press, and is hidden from assistive technology. The region
  of the toasts is left out of that.
- What scrolls inside a dialog, a drawer or the region of the toasts
  behaves alike in the three engines. A control or a toast that takes the
  keyboard focus while a part of it is cut off is scrolled into sight in
  full, and the drawer that scrolls as one in a low window is no stop of
  the Tab key.

Toasts:

- They appear in one region that announces politely, a landmark named
  "Notifications". Every tone is announced that way, a failure too.
- A toast stays five seconds, and a failure until it is dismissed. The
  time stops under the pointer, with the focus in the region, and in a
  window that is not the active one. `F6` moves the focus to the region,
  and Escape there dismisses the toast that has the focus and nothing
  beside it.
- No more than five show at once, the newest on top. A failure beyond
  five waits for room. A toast with a time does not: it is gone when its
  time is up, whether it was seen again or not.

Where what floats is put, and Base UI under the policy:

- A popup, a tooltip, a popover, a menu or the list of a select, opens
  inside a landmark or a dialog and never at the end of the page. The
  shell has a place for the popups of the page in its main region, a
  dialog and a drawer each have one inside themselves, and so has the
  region of the toasts. A popup is fixed to the window, so that the place
  it is in does not clip it, and for that reason a dialog is not moved
  with a transform.
- One provider around the application tells Base UI to add no `<style>`
  element, and the select says the same itself. The list of a select opens
  below its field. Base UI's scroll area and its sliding indicator for
  tabs are not used.
- A Base UI part that is new to the primitives is read for a `<style>`
  element before it is used, and is shown in the gallery.

The gallery:

- A page at `/gallery` shows every primitive in every look and state, with
  made-up content that says nothing about a cluster. It is part of the
  binary, the command palette leads to it, and it is no view: it has no
  row in the view table and no link in the navigation.
- The end-to-end tests of the primitives run on it: every overlay opened
  by the keyboard under the server's policy, and the axe scan with each
  kind of overlay open, in both themes.

[ui.md](../ui.md) describes the result for whoever builds a view, and
lists every departure from the handoff.

## Why

- A view that composes primitives cannot go around what they see to. A
  name, a role, the path of the focus and a pair of colours are decided
  once, and tested once.
- A fixed set of looks is what keeps the list of pairs true. A class at
  the place of use would add a pair nobody computed, and of two classes
  for one property the stylesheet decides which holds, not the order they
  were written in. [0020](0020-go-lines-tools-and-libraries.md) asks a
  record for every runtime dependency, and merging classes is not worth
  one.
- The handoff uses 26, 28 and 30 px for controls of one kind, and its
  20 px segment is harder to hit than anything else it draws. One scale
  lets a button, a field and a chip of one size stand level.
- An empty field has nothing but its boundary to be known by, so the
  boundary is where 3:1 applies. Asked of every border, it would turn
  every button and every card into a dark outline; not asked at all, it
  would leave a field invisible to someone with low vision.
- Opacity on a disabled button dims its focus ring to under 2:1 in the
  light theme, on a control that is kept focusable so that the keyboard
  can reach its reason.
- Each ARIA pattern is the one that says what the control is. A group of
  toggle buttons can have none pressed, a radio group cannot; a filter
  that is on or off is exactly a pressed button.
- An entry that is disabled and skipped does not exist for a user of a
  screen reader. Base UI keeps such entries reachable, and the WAI-ARIA
  practices recommend it for a menu.
- A tooltip that repeats a name would be read twice if it were announced,
  and a reason that is only shown would not be read at all: hence the two
  kinds. Base UI shows one tooltip at a time, whether its provider is
  around them or not, which closed the reason the focus had brought up as
  soon as the pointer came to rest on another control, and did not bring
  it back when the pointer left. WCAG 2.1 asks that such content stays
  until its own cause is gone (success criterion 1.4.13).
- Base UI does not keep Escape to a tooltip in two cases that were
  reproduced: the pointer rests on one control while another has the
  focus, and the control is a button that is disabled and focusable. In
  both the dialog around it closed. So the tooltip takes the key itself.
- A press beside a dialog is a common accident. For a confirmation it
  must not count as an answer, and Enter pressed too soon must not send
  the request.
- Base UI keeps the focus in a modal overlay by turning the Tab key round
  at its edges and hides the rest from assistive technology. Both were
  found to give way. The focus got out by a press on the scrim of a
  confirmation, by a press on the button of a toast, which then goes, and
  it can get out by way of the browser's own controls; from the page the
  Tab key walked the controls behind the scrim, and each of them worked.
  The header of the shell, in a layer above the one Base UI catches a
  press outside with, answered the pointer under an open drawer. And Base
  UI leaves every element that has an `aria-live` attribute readable,
  with everything around it. Inert, the outside is out of reach whatever
  is in it and whatever way the focus took.
- The engines disagree in two things about a part that scrolls, and the
  end-to-end tests in Firefox showed both. Firefox scrolls to the control
  that takes the focus only when none of it is in sight, where Chromium
  and Safari also scroll to one that is cut off in part: a toast or the
  last button of a dialog took the focus in a low window and stayed half
  out of sight, ring and all. And Firefox makes a stop of the Tab key of
  whatever scrolls and carries no `tabindex`, with controls in it or
  without: the drawer that scrolls as one was a stop there, with neither a
  role nor a name, before its first control.
- A menu, a list box or a tooltip at the end of the page is in no
  landmark. A user who moves by landmarks never comes by, and axe reports
  it. Inside a dialog the same holds for what opens from the dialog, which
  Base UI puts beside it.
- Base UI's urgent announcement for a toast hides the toast one can see
  from assistive technology and leaves it in the order of the Tab key,
  which axe reports. A polite region has neither fault.
- Five seconds that the user can stop are taken to meet WCAG 2.1, success
  criterion 2.2.1, and a failure that vanished after five seconds would be
  the one message that must not be missed. The stop has to be used within
  those five seconds, and nothing lengthens the time beforehand: whether
  that is enough is listed below as open.
- The policy is in force in the binary alone. A primitive that needed an
  inline style would pass every component test and fail for the user, so
  each has to be exercised in a page the binary serves, and the gallery
  is that page. It is also the one place the designer can see every state
  without a cluster.

## Costs

- A wrapper has to be kept for every Base UI part. A feature of Base UI is
  not available to a view until a primitive offers it, and an upgrade of
  Base UI is checked against every wrapper.
- A look that is needed once cannot be made at the place of use. It is a
  new variant, with its pair of colours computed and listed.
- Toolbars are 2 px higher than drawn, the buttons of a dialog 2 px
  lower, the small segmented control 4 px higher and the one on the page
  2 px lower.
- Fields have a far darker boundary than drawn, badges lose their
  coloured text, and the primary button is the darker accent in the light
  theme and the lighter one in the dark theme. Each is a departure the
  designer may want to answer with a change of the tokens instead, and the
  list of pairs has to be kept by hand beside the classes.
- What a disabled button, option, tab or entry holds has to be an
  element, so that it can be dimmed: a bare text is wrapped.
- The arrow keys change the choice of a segmented control and the tab at
  once, so a view has to make such a change cheap.
- A letter typed while a menu, a popover or the list of a select is open
  does nothing on the page, also where it would be harmless.
- Touch input gets no tooltip, so nothing that is needed may be said by
  one, and a caller has to choose the kind of a tooltip rightly. The
  reason a control is disabled is said by a tooltip alone all the same:
  a user of a touch screen sees that the control is disabled and not why.
  That exception is accepted for now and listed below as open. On a
  control whose tooltip names a key, such as the close button of the
  drawer, the first Escape hides the tooltip and only the second closes
  the drawer.
- The tooltip goes against Base UI in two places, by refusing a close for
  the two reasons Base UI gives when the pointer leaves and when another
  tooltip opens, and by taking Escape on the document. Both have to be
  looked at again with every upgrade of Base UI.
- A mouse user cannot back out of a confirmation by a press beside it.
- With the drawer open, the header is in sight and does not work, the
  shortcut of the palette excepted.
- What is inert behind an overlay is worked out by the primitives, by a
  walk from the overlay up to the body, beside Base UI's own marking of
  the same elements. It depends on where Base UI puts its portals. It
  also depends on Base UI noting which control to give the focus back to
  in the very step in which the overlay opens: the control is inert from
  that step on, and the browser takes the focus off an inert element a
  moment later. Both are to be looked at with every upgrade. An element
  that has to stay in reach beside an overlay, as the region of the
  toasts does, has to say so.
- In the lowest windows a dialog scrolls as a whole and its body scrolls
  inside it, two regions that scroll one in the other. A toast with a
  time that five newer ones cover is never seen again.
- A dialog, a drawer and each toast look at where the control that takes
  the focus lies, on every such focus, to do in Firefox what the other two
  engines do by themselves. It has to be looked at again when an engine
  changes what it scrolls to. The main region and the sidebar of the
  shell, and a popover, are left to the browser: there a control that
  takes the focus half out of sight stays so in Firefox.
- The region of the toasts scrolls, and what scrolls cuts off the shadow
  of a toast at its edge. So the region is larger than the toasts, by the
  room the shadow takes, and lets the pointer through to the page there,
  as the handoff's does. A scroll bar of the region cannot be dragged for
  that reason: where the toasts are higher than the window, the wheel
  over a toast and the keyboard scroll them. The ring of the region
  frames that room and no longer the toasts alone.
- A failure is announced when the screen reader next pauses, not at once.
  A failure nobody dismisses stays. The page has a fourth landmark.
- The shell and each dialog and drawer carry an element and a context
  that Base UI does not expect. A dialog must not be transformed, which a
  later change can forget; and the place inside a dialog keeps one kind of
  focus event to itself, to keep Base UI's own handling of the focus from
  taking the focus off a menu's button, which has to be looked at again
  with every upgrade of Base UI.
- Every new Base UI part has to be read for a `<style>` element before it
  is used. The end-to-end test is what would catch one, and it sees only
  what the gallery shows.
- The gallery is a page for developers and the designer that every user
  can open, and a file of its own in the binary. It has to be kept in step
  with the primitives, and free of anything that looks like cluster data.
- Open for the maintainer, with the choice taken here: the text of a
  badge in `--t1` and not in a colour; `--t3` and no new token for the
  boundary of a field; the native select given up; no tooltip for touch,
  the reason a control is disabled included; the header left in sight
  over the drawer; the gallery listed in the palette; the status popover
  that opens under the pointer not built; five seconds for a toast that
  is no failure, a warning among them, with no setting that keeps every
  toast until it is dismissed; the drawer and the toasts moving, where
  the handoff draws them without motion.
- Open for the designer, with nothing changed for it: on a narrow screen
  a toast takes most of the width of the page and can lie over the
  control that has the keyboard focus, for five seconds, and a failure
  until it is dismissed. WCAG 2.2 asks that a control with the focus is
  never hidden entirely (success criterion 2.4.11); WCAG 2.1 AA, the
  target of [0014](0014-accessibility-and-browsers.md), has no such
  criterion. A place for the toasts that covers no control, or a page
  that makes room for them, would be a change to the handoff.
