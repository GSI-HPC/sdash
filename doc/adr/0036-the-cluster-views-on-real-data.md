<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0036: The cluster views on real data

Status: proposed

## Context

[0034](0034-cluster-data-in-the-browser-api.md) serves the nodes,
partitions and jobs of a cluster, and
[0035](0035-the-jobs-view-and-its-table.md) shows the jobs. The Nodes,
Partitions and Overview views were placeholders, and the header showed a
status pill and a cluster switcher that said nothing about a cluster. The
handoff in `doc/design/` draws the three views with more than the browser
API serves: racks, GPUs, the scheduler, reservations, and actions that
change the cluster. [0035](0035-the-jobs-view-and-its-table.md) put the
cluster in the address, but a link to another view left it behind.

## Decision

- **The kinds of a view are in the view table**, `web/src/routing/views.ts`,
  beside its route: the kinds of data it shows. The view asks for the pulse
  of those kinds, and the header asks for the pulse of the kinds of the view
  at the address, with the same query key, so the two share one request.
- **The status pill tells the state of the data on the screen**, in a word
  and a tone: "Live" when every kind was read, "Degraded" when a kind's
  last fetch failed, "Auth" for a token slurmrestd refused, "Offline" for a
  slurmrestd or a sdash that does not answer, "Connecting" before the
  first answer, "Idle" on a view that asks for no data. The words are the
  handoff's. The pill has no popover; the Overview shows the connection in
  a card.
- **The cluster switcher is a menu** of the clusters of the profile file,
  with a light in the tone of the pill and the Slurm release of the cluster
  shown. Choosing a cluster keeps the view and leaves its filters behind,
  as they were chosen for the other cluster.
- **A link keeps the cluster.** The links of the sidebar, the shortcuts,
  the palette and the links between views name the cluster of the address
  they were followed from. The other parameters belong to the view that
  set them and are left behind.
- **The Nodes view is a map of the nodes** in the cell grid of
  [0030](0030-primitives-that-show-data.md), one cell a node in the colour
  of its state: idle, mixed, allocated, reserved, draining, down. Filters
  by name, state and partition are in the address. The browser filters,
  as the map shows every node.
- **The Partitions view is a table** of the partitions: state, the states
  of their nodes, the CPUs allocated, the limits, and the number of jobs,
  with links to the nodes and the jobs of each partition. The numbers of
  jobs are the facets of one page of one job, not a list of the jobs.
- **The Overview shows the cluster at a glance**: its nodes, the CPUs and
  memory allocated, its jobs, the CPUs allocated by partition, the map of
  the nodes, and the connection, beside the summary of which sdash runs.
- **Left out** until the browser API serves what they need: the racks,
  gradients, GPU and job modes and the drawer of the Nodes map; the
  default tag, the GPUs, the split of running and pending jobs, and the
  drain and resume actions of the Partitions view; the GPU, scheduler,
  reservation and "needs attention" cards of the Overview; and the
  refresh control, the role and the avatar of the header.

## Why

- A view that names its kinds in the table gives the header what to ask
  for without a second request, and the pill then speaks of what the user
  sees, not of a kind no view shows.
- Words for the states, and not a colour alone, are what WCAG 2.1
  success criterion 1.4.1 asks for. A popover on a pill is a second way to
  the same facts, which the Overview card gives in one place.
- Filters set on one cluster can hide every node or job of another, and a
  view that then shows nothing reads as a broken cluster.
- A user who switched to a cluster expects every view to show it until
  they switch again.
- A cluster has thousands of nodes at most; one list of them is small, and
  the map is of all of them. Jobs can be millions, and are counted by the
  server.
- What the handoff draws and the API cannot serve would be made up.

## Costs

- Each new view of cluster data needs its kinds in the view table, or the
  pill says nothing of its data.
- The Nodes view fetches every node to show one; a cluster with tens of
  thousands of nodes sends a large answer every change.
- The Partitions view and the Overview read three kinds, and are as late
  as the slowest.
- The cluster the address names is lost by a link written by hand without
  it, which then shows the first cluster of the profile file.
