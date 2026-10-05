// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the primitives share in looks: the one way to join class names, the
// size scale of a control, the layers of what floats, and the classes that
// two primitives have to agree on. A class is written out in full wherever
// it is used, because Tailwind reads the source for whole names
// (doc/adr/0026-ui-primitives-on-base-ui.md).

/** Joins class names and leaves out what is false, null or undefined. */
export function cx(
  ...parts: readonly (string | false | null | undefined)[]
): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * The sizes of a control: its height, the gap inside it, its radius, its
 * padding and its text. Four steps where the handoff has eight heights
 * (doc/ui.md lists the departures); the smallest is 24 px high, so that
 * nothing is harder to hit than that.
 */
export const controlSizes = {
  xs: "h-6 gap-1.25 rounded-sm px-2.25 text-[0.71875rem]",
  sm: "h-7 gap-1.5 rounded-[5px] px-2.5 text-xs",
  md: "h-8 gap-1.5 rounded-md px-3 text-[0.78125rem]",
  lg: "h-9 gap-2 rounded-md px-4 text-[0.8125rem]",
} as const;

/** One of the sizes of a control. */
export type ControlSize = keyof typeof controlSizes;

/** The sizes of a control that shows an icon and nothing else. */
export const squareSizes = {
  xs: "size-6 rounded-sm",
  sm: "size-7 rounded-[5px]",
  md: "size-8 rounded-md",
  lg: "size-9 rounded-md",
} as const;

/** The size of an icon inside a control of each size. */
export const iconSizes = {
  xs: "size-3 stroke-2",
  sm: "size-3.5 stroke-2",
  md: "size-3.5 stroke-2",
  lg: "size-4 stroke-2",
} as const;

/**
 * The surface of everything that floats over the page: a tooltip, a
 * popover, a menu, the list of a select, a dialog, a toast.
 */
export const floating = "border border-bd bg-surface text-t1 shadow-lg";

/**
 * The layers, lowest first, after the handoff's: the drawer, the dialogs,
 * what opens from inside either, the tooltips, the toasts. What opens from
 * the page itself lies in the shell's place for popups (popups.tsx), below
 * the dialogs.
 */
export const layers = {
  drawerScrim: "z-30",
  drawer: "z-31",
  dialogScrim: "z-50",
  dialog: "z-51",
  popup: "z-60",
  tooltip: "z-65",
  toast: "z-70",
} as const;

/**
 * An entry of a menu and an option of the list of a select, which look
 * alike. The marked entry has the focus and with it the ring; the ring is
 * drawn inside the entry, where the list does not clip it.
 *
 * The arrow keys stop on an entry that is disabled, as Base UI has it, so
 * such an entry dims what it holds and not itself: its ring keeps its
 * strength (dimmedWithin says why). What an entry holds therefore has to
 * be elements, not a bare text.
 */
export const listItem =
  "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.75 text-[0.78125rem] text-t1 -outline-offset-2 select-none data-disabled:*:opacity-45 data-highlighted:bg-hover";

/** The heading of a group of entries. */
export const listLabel = "px-2 py-1.5 text-[0.6875rem] text-t3";

/**
 * The text at the end of an entry. The handoff sets it in --t3, which
 * reaches 3.9:1 on the background of the marked entry in the light theme.
 */
export const listDetail = "ml-auto pl-3 text-[0.6875rem] text-t2";

/** The line between groups of entries. */
export const listSeparator = "my-1 h-px bg-(--bds)";

/**
 * The boundary of a field. An empty field is known by its boundary alone,
 * so it stands 3:1 against the field and against what the field lies on
 * (WCAG 2.1, success criterion 1.4.11); the handoff's --bd reaches 1.1:1.
 */
export const fieldBoundary = "border border-(color:--t3)";

/**
 * The fills of a field: the elevated one where the field lies on a card or
 * in a dialog, the surface where it lies on the page itself.
 */
export const fieldFills = {
  elevated: "bg-elevated",
  surface: "bg-surface",
} as const;

/** One of the fills of a field. */
export type FieldFill = keyof typeof fieldFills;

/**
 * The sizes of a field, a text field or the trigger of a select: two of
 * the heights of a control, so that a field lines up with a button of its
 * size.
 */
export const fieldSizes = {
  sm: "h-7 rounded-[5px] px-2 text-xs",
  md: "h-8 rounded-[5px] px-2.5 text-[0.78125rem]",
} as const;

/** One of the sizes of a field. */
export type FieldSize = keyof typeof fieldSizes;

/**
 * A field whose value is not accepted: its boundary in the colour of an
 * error, and twice as thick where the system forces its colours and paints
 * every boundary alike. The text below the field says what is wrong; the
 * boundary only shows which field it is about.
 */
export const fieldInvalid =
  "data-invalid:border-err forced-colors:data-invalid:border-2";

/**
 * The label above a field. The handoff sets it, and the line below the
 * field, in --t3, which is below 4.5:1 on the page in the light theme.
 */
export const fieldLabel =
  "flex items-center gap-1.25 text-[0.71875rem] font-medium text-t2";

/** The line below a field that says what the field is for. */
export const fieldDescription = "text-[0.6875rem] leading-[1.35] text-t2";

/** The line below a field that says what is wrong with its value. */
export const fieldError = "text-[0.6875rem] leading-[1.35] text-err-fg";

/**
 * The place of that line, which is on the page before the line is and has
 * the role "status", so that what appears in it is announced: the line is
 * tied to its field as a description, and a description is read on
 * arriving at the field, not when it changes (WCAG 2.1, success criterion
 * 4.1.3). The role and not the aria-live attribute: Base UI leaves every
 * element with that attribute, and everything around it, readable behind
 * a dialog. While the place is empty it takes no room: its margin takes
 * back the gap of the field's column, and hands it to the line.
 */
export const fieldErrorPlace = "-mt-1.25 flex flex-col *:mt-1.25";

/**
 * For an icon that has a colour class of its own. Where the system forces
 * its colours, text takes the system's colour and such an icon would keep
 * the token's, which against the system's background can be anything: the
 * tick that alone marks the chosen option fell to 2.1:1. There the icon
 * takes the colour of the text around it.
 */
export const iconInForcedColours = "forced-colors:text-inherit";

/**
 * A control that cannot be used, as the handoff dims it. For a control
 * that leaves the order of the Tab key while it is disabled, a chip, a
 * field: one that can still have the focus uses dimmedWithin.
 */
export const dimmed =
  "data-disabled:cursor-not-allowed data-disabled:opacity-45";

/**
 * A control that cannot be used and can still have the focus: a button
 * that stays in the order of the Tab key to give its reason, a tab the
 * arrow keys stop on. It dims the elements inside it and not itself.
 * Opacity on the control would dim the ring of the focus with it, to
 * 1.9:1 in the light theme and 2.7:1 in the dark one, where a keyboard
 * user has to see at 3:1 where the focus is. What such a control shows
 * therefore has to be an element, not a bare text.
 */
export const dimmedWithin =
  "data-disabled:cursor-not-allowed data-disabled:*:opacity-45";
