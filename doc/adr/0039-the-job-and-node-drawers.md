<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0039: The job and node drawers

Status: proposed

## Context

[0035](0035-the-jobs-view-and-its-table.md) lists the jobs of a cluster a
page at a time, and [0036](0036-the-cluster-views-on-real-data.md) shows
its nodes as a map. The handoff opens a drawer with the details of a job
from its row, and one with the details of a node from its cell, the jobs
on the node among them. The `Drawer` primitive is built
([0029](0029-ui-primitives-on-base-ui.md)), and an open drawer belongs in
the address ([0024](0024-addresses-and-keyboard-in-the-shell.md)). The
browser API serves pages of jobs and every node, but no job by its id and
no jobs of a node, and the model knows a job's nodes only as a host list,
which sdash does not expand.

## Decision

- **One job by its id**, `GET /clusters/{cluster}/jobs/{job}`, read from
  the jobs sdash holds, with the answer 404 when they hold no job of the
  id. The id is the job's own, which a task of an array has as well.
- **The jobs of a node**: getJobs takes `node`, which keeps the jobs that
  have the node. sdash's model has the name of each node of a job, which
  slurmrestd sends among the job's resources, so that no host list is
  expanded.
- **More of a job and a node** in the model and the document: a job's
  tasks, trackable resources, batch host, comment and submit line; a
  node's trackable resources, the user who gave its reason and when,
  operating system and when it was last busy.
- **The job drawer** opens from the id in the table of jobs, a link to the
  view with `job` in the address. It shows the state, the times, the
  resources with a link to the drawer of each node, and the files. It
  reads the job itself, so a link to a job that no page shows opens it.
- **The node drawer** opens from a cell of the map of the Nodes view, with
  `node` in the address, and from the map of the Overview, which leads to
  the Nodes view with it. It shows why the node is drained or down, the
  CPUs, the memory and the load as meters, what the node is, and the
  newest twenty of the jobs that have it, each a link to its drawer.
- **The seeded reservation** starts when the cluster is seeded and lasts
  ten years, so that the captures hold one that is active.
- **Left out**: the actions of the handoff's drawers, which change the
  cluster and wait for a decision on writes and roles; the job page that
  the handoff opens from the id; the drawer's tab with the JSON of
  slurmrestd, whose shapes do not reach the browser
  ([0034](0034-cluster-data-in-the-browser-api.md)).

## Why

- The jobs sdash holds are the ones the table shows; a job read from them
  says what its row says, and reads nothing more from slurmrestd.
- The names of a job's nodes come from slurmrestd as a list; expanding a
  host list in sdash would copy a grammar of Slurm's.
- A link is what a keyboard and a screen reader already know, and it puts
  the job into the address, so that Back closes the drawer.
- A reservation that starts a day after the capture has ended long before
  a test reads it; one that lasts ten years stays active while the
  capture is in use.

## Costs

- A job that slurmctld has forgotten cannot be opened, though a link to it
  stays valid; the drawer says that the job is no longer held.
- The jobs of a node are those slurmctld still holds, the ended ones among
  them, and no more than twenty of them are listed.
- The table of jobs is opened from its id alone, not from anywhere in the
  row, as the handoff does it.
