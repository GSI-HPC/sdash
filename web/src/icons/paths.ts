// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Every icon of the interface, as the path data of a 24 by 24 drawing that
// is stroked and not filled. They are the icons of the design handoff
// (doc/design/sdash.dc.html), copied path for path, and they live here as
// text so that no icon package has to be installed, updated and listed for
// some twenty drawings (doc/adr/0013-frontend-stack.md). Icon.tsx draws one.

/** The path data of each icon, by name. */
export const icons = {
  // The views, named after what the navigation uses them for.
  overview: "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z",
  nodes: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  partitions: "M4 5h16v14H4zM10 5v14M16 5v14",
  reservations: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  jobs: "M4 6h16M4 12h16M4 18h10",
  submit: "M12 5v14M5 12h14",
  history: "M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4",
  accounts:
    "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1a3 3 0 0 0-2-2.8M4 19v-1a3 3 0 0 1 2-2.8",
  qos: "M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z",
  diagnostics: "M3 12h4l3-8 4 16 3-8h4",
  conf: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
  apiExplorer: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14",

  // The controls of the header and the sidebar.
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  chevronDown: "M6 9l6 6 6-6",
  sidebarCollapse: "M4 4h16v16H4zM9 4v16M16 10l-2 2 2 2",
  sidebarExpand: "M4 4h16v16H4zM9 4v16M13 10l2 2-2 2",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
} as const;

/** The name of an icon. */
export type IconName = keyof typeof icons;
