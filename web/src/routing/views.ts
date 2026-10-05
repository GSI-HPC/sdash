// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The table of views: the one place that says which views sdash has. The
// routes, the navigation in the sidebar, the "g" shortcuts, the entries of
// the command palette and the tests are all worked out from it, so a view
// is added by adding a row here and a component in views/, and none of
// those can then lack it or disagree about it
// (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
//
// The module is data and nothing else: it imports no component, so that the
// unit tests and the end-to-end tests can read it without a browser.

import type { IconName } from "../icons/paths";

/** The groups of the navigation, in the order the sidebar shows them. */
export const groups = ["Cluster", "Workload", "Accounting", "System"] as const;

/** One group of the navigation. */
export type Group = (typeof groups)[number];

/** What the table says about a view. */
export interface View {
  /** The name the code knows the view by. */
  readonly id: string;
  /**
   * The address of the view, a path below the root. It is part of what a
   * user bookmarks and shares, so it does not change once released.
   */
  readonly path: `/${string}`;
  /**
   * The name of the view: its label in the navigation, its heading and the
   * first part of the document title.
   */
  readonly title: string;
  /** One line on what the view shows, for the page header. */
  readonly summary: string;
  /** The group of the navigation the view is listed in. */
  readonly group: Group;
  /** The icon beside the label. */
  readonly icon: IconName;
  /** The letter that, pressed after "g", goes to the view. */
  readonly goKey: string;
  /**
   * Words a user may type into the command palette to find the view that
   * its title does not contain.
   */
  readonly keywords: readonly string[];
}

/**
 * The views, in the order of the navigation: group by group, and inside a
 * group as the design handoff lists them (doc/design/README.md, "Global
 * layout"). The letters are the handoff's too.
 */
export const views = [
  {
    id: "overview",
    path: "/overview",
    title: "Overview",
    summary:
      "The cluster at a glance: nodes, allocated CPUs and GPUs, jobs, partitions and reservations.",
    group: "Cluster",
    icon: "overview",
    goKey: "o",
    keywords: ["home", "dashboard", "summary"],
  },
  {
    id: "nodes",
    path: "/nodes",
    title: "Nodes",
    summary:
      "Every node of the cluster as a heat map, by state, jobs, load or allocation.",
    group: "Cluster",
    icon: "nodes",
    goKey: "n",
    keywords: ["heat map", "hosts", "racks"],
  },
  {
    id: "partitions",
    path: "/partitions",
    title: "Partitions",
    summary:
      "The partitions with their state, their nodes, their limits and their jobs.",
    group: "Cluster",
    icon: "partitions",
    goKey: "p",
    keywords: ["queues"],
  },
  {
    id: "reservations",
    path: "/reservations",
    title: "Reservations",
    summary: "Active and upcoming reservations, on a timeline and as a table.",
    group: "Cluster",
    icon: "reservations",
    goKey: "r",
    keywords: ["maintenance", "calendar"],
  },
  {
    id: "jobs",
    path: "/jobs",
    title: "Jobs",
    summary:
      "The queue: running and pending jobs, filtered by state, partition and user.",
    group: "Workload",
    icon: "jobs",
    goKey: "j",
    keywords: ["queue", "running", "pending", "squeue"],
  },
  {
    id: "submit",
    path: "/submit",
    title: "Submit job",
    summary:
      "A form for a batch job, with a check of the request before it is sent.",
    group: "Workload",
    icon: "submit",
    goKey: "s",
    keywords: ["new", "batch", "sbatch", "script"],
  },
  {
    id: "history",
    path: "/history",
    title: "Job history",
    summary:
      "Finished jobs from accounting, with exit codes, run times and efficiency.",
    group: "Workload",
    icon: "history",
    goKey: "h",
    keywords: ["finished", "accounting", "sacct"],
  },
  {
    id: "accounts",
    path: "/accounts",
    title: "Accounts & users",
    summary: "The tree of accounts and users, with their shares and limits.",
    group: "Accounting",
    icon: "accounts",
    goKey: "a",
    keywords: ["associations", "sacctmgr"],
  },
  {
    id: "qos",
    path: "/qos",
    title: "QOS & fairshare",
    summary: "The quality-of-service definitions and the fairshare tree.",
    group: "Accounting",
    icon: "qos",
    goKey: "q",
    keywords: ["quality of service", "priority", "shares", "sshare"],
  },
  {
    id: "diagnostics",
    path: "/diagnostics",
    title: "Diagnostics",
    summary:
      "What the scheduler reports about itself: cycle times, backfill and remote procedure calls.",
    group: "System",
    icon: "diagnostics",
    goKey: "d",
    keywords: ["scheduler", "statistics", "sdiag", "rpc"],
  },
  {
    id: "conf",
    path: "/conf",
    title: "slurm.conf",
    summary: "The configuration the cluster runs with, to search and read.",
    group: "System",
    icon: "conf",
    goKey: "c",
    keywords: ["configuration", "settings"],
  },
  {
    id: "api-explorer",
    path: "/api-explorer",
    title: "API explorer",
    summary:
      "The operations of slurmrestd, to send a request to and read the answer of.",
    group: "System",
    icon: "apiExplorer",
    goKey: "x",
    keywords: ["rest", "slurmrestd", "endpoints", "requests"],
  },
] as const satisfies readonly View[];

/** The name of a view. */
export type ViewId = (typeof views)[number]["id"];

/** The view the root address leads to. */
export const startView: View = views[0];

/**
 * The root address. It shows nothing of its own and leads on to the start
 * view.
 */
export const rootPath = "/";

/**
 * The address the user ends up at who opens the given one: the address of
 * the start view for the root, and the address itself for any other.
 */
export function leadsTo(pathname: string): string {
  return pathname === rootPath ? startView.path : pathname;
}

/**
 * The view an address shows: the one whose path the address is, letter for
 * letter. "/Nodes", "/nodes/" and "/nodes/r07" are the addresses of no
 * view. The routes and the navigation both ask here and nowhere else, so a
 * view has one address, the one it is bookmarked and shared under, and
 * the link that is marked as current is always the one of the view that
 * shows.
 */
export function viewAt(pathname: string): (typeof views)[number] | undefined {
  return views.find((view) => view.path === pathname);
}

/** The row of a view. */
export function viewOf(id: ViewId): View {
  const view = views.find((row) => row.id === id);
  if (!view) {
    // ViewId is made from the rows, so this is a mistake in this module.
    throw new Error(`the view table has no row with the id ${id}`);
  }
  return view;
}

/** The views of each group, for the navigation. */
export function viewsByGroup(): { group: Group; views: readonly View[] }[] {
  return groups.map((group) => ({
    group,
    views: views.filter((view) => view.group === group),
  }));
}

/** The name of the application, the last part of every document title. */
export const applicationName = "sdash";

/**
 * The title of the document while a page with the given heading shows:
 * what a browser tab, a bookmark and the history list say, and the first
 * thing a screen reader reads of a page.
 */
export function documentTitle(heading: string): string {
  return `${heading} - ${applicationName}`;
}
