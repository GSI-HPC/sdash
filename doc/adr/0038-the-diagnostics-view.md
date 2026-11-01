<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0038: The Diagnostics view

Status: proposed

## Context

[0034](0034-cluster-data-in-the-browser-api.md) serves the data of a
cluster as kinds, and [0036](0036-the-cluster-views-on-real-data.md) and
[0037](0037-the-reservations-view.md) show them. The Diagnostics view was a
placeholder, and the Overview left out the scheduler card of the handoff.
The handoff draws the view as a row of the job counters since midnight, three
cards of figures for slurmctld, the main scheduler and the backfill
scheduler, and two tables of the remote procedure calls (RPCs) by message
type and by user, with a bar for the share of each. slurmrestd answers it
at `GET /slurm/{v}/diag/`, with what `sdiag` prints, and its capture is in
the tree ([0016](0016-e2e-and-fixtures-on-sind.md)).

## Decision

- **A fifth kind of data, `diagnostics`**, read through
  `GET /slurm/{v}/diag/`, held by a read-through cache of its own with a
  period of 30 seconds, as the jobs are, and served whole by the operation
  `getDiagnostics`. The view and the Overview ask for the kind, so the pulse
  keeps it watched while either shows.
- **sdash's model** has the daemon figures, the job counters, the timing of
  the main scheduler and of the backfill scheduler, and the RPCs by type and
  by user, most frequent first and equal counts by name. Every duration is in
  microseconds, as `sdiag` prints them. The vendored document says seconds
  for the times of an RPC, but slurmctld counts microseconds, as `sdiag`
  prints them; the capture holds only zeros and cannot confirm it, so the
  first non-zero capture on a sind cluster should be checked against it.
- **The view** shows the counters on a card each, three cards of figures
  and a table for each kind of RPC. Times are written in the unit that
  fits them. A bar in each row shows the calls of the row against the
  busiest row.
- **The Overview** gains a "Scheduler" card with the last and mean cycle of
  the main scheduler, the last cycle, the depth and the jobs of the
  backfill, the server threads and the agent queue, and a link to the view.
- **Left out**: the pending RPCs, the reasons a cycle exits and the count
  of heterogeneous jobs backfilled, which the document has and the handoff
  does not draw; the latency of slurmrestd, which is the ping and no part
  of the diagnostics.

## Why

- The counters move all the time, so a short period is needed; the call is
  one RPC to slurmctld, as the jobs list is a larger one.
- Keeping the unit of the source in the API leaves the writing to the
  browser, which knows the width it has.
- The pending RPCs and the exit reasons are for someone who tunes the
  scheduler; the table of RPCs and the cycle times are for someone who asks
  why the cluster is slow, which is what the view is for.

## Costs

- The capture was taken in the first minute of a day, so its counters are
  zero; the browser tests look for what the view draws, and the component
  tests give it figures.
- A user who reads `sdiag` finds fewer figures here.
