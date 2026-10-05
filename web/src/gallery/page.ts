// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the gallery is called and which sections it has. The gallery is the
// page that shows every primitive in every state, for the tests and for
// the designer (doc/adr/0026-ui-primitives-on-base-ui.md). It is no view:
// it has no row in the view table, no link in the navigation and no "g"
// key.
//
// The module is data and nothing else: it imports no component, so that
// the routes, the command palette and the end-to-end tests can read it
// without the gallery itself, which is loaded when it is first opened.

/** The address of the gallery. */
export const galleryPath = "/gallery";

/** Its heading, and the first part of the document title. */
export const galleryTitle = "Component gallery";

/**
 * Its sections, one for each primitive, in the order of the page. The id
 * is the id of the section's heading, and with it the fragment of the
 * address that leads to the section: "/gallery#drawer".
 */
export const sections = [
  { id: "button", title: "Button" },
  { id: "icon-button", title: "IconButton" },
  { id: "badge", title: "Badge" },
  { id: "chip", title: "Chip" },
  { id: "kbd", title: "Kbd" },
  { id: "input", title: "Input" },
  { id: "select", title: "Select" },
  { id: "segmented-control", title: "SegmentedControl" },
  { id: "tabs", title: "Tabs" },
  { id: "tooltip", title: "Tooltip" },
  { id: "popover", title: "Popover" },
  { id: "menu", title: "Menu" },
  { id: "dialog", title: "Dialog" },
  { id: "confirm-dialog", title: "ConfirmDialog" },
  { id: "drawer", title: "Drawer" },
  { id: "toast", title: "Toast" },
] as const;

/** The id of one of the sections. */
export type SectionId = (typeof sections)[number]["id"];
