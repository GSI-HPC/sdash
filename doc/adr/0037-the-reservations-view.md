<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0037: The Reservations view

Status: proposed

## Context

[0034](0034-cluster-data-in-the-browser-api.md) serves the jobs, nodes and
partitions of a cluster, and
[0036](0036-the-cluster-views-on-real-data.md) shows them. The Reservations
view was a placeholder. The handoff draws it as a timeline from yesterday
to six days ahead, with a line at now and a row for each reservation, above
a table with the name, the state, the nodes, the start, the end, the
duration, who may use it and the flags, and buttons to make and delete a
reservation. The seeded sind cluster holds one reservation, and its
capture is in the tree ([0016](0016-e2e-and-fixtures-on-sind.md)).

## Decision

- **A fourth kind of data, `reservations`**, read through
  `GET /slurm/{v}/reservations/`, held by a read-through cache of its own
  with a period of 60 seconds, as the partitions are, and served whole by
  the operation `getReservations`. sdash's model has a reservation's name,
  nodes, cores, start and end, flags, the users, accounts and groups that
  may use it, its partition, TRES, features and licences. The names are
  lists, parted at the commas slurmctld writes.
- **The view** shows the reservations on a timeline of eight days from
  yesterday, and every reservation in a table below it. Where a
  reservation stands, upcoming, active or ended, and the line of now are
  taken at the moment sdash fetched the reservations. The timeline has a
  row only for a reservation that holds its nodes in the days shown.
- **A primitive, `Timeline`**: rows of stretches of time over a number of
  days, the days named above them, today in the accent and a line at now.
  A stretch takes a tone of the graphics; the view gives maintenance one
  tone, a daily reservation another, and the rest a third, as the handoff
  does. The timeline is an image to assistive technology, whose name says
  that the table lists the same reservations in words.
- **Left out**: making and deleting a reservation, which change the
  cluster and wait for a decision on writes and roles; the count beside
  the item of the navigation; the reservations card of the Overview.

## Why

- Reservations are few, change seldom, and are read whole, as the
  partitions are.
- Taking now from the fetch keeps a view that is not fetched again the
  same; the data are at most a period old, which the timeline cannot show
  at the width of a day.
- Where a stretch lies on a timeline is no text that a screen reader could
  follow; the table holds every fact the timeline shows, and the timeline
  names it.
- A reservation that does not reach into the days shown would be an empty
  row.

## Costs

- The timeline shows nothing of a reservation more than six days ahead;
  the table lists it.
- The colours of the stretches tell maintenance from a daily reservation
  only to a user who sees them; the flags in the table say it in words.
- The fake slurmrestd answers with the capture of a reservation that has
  ended since, so the browser tests see an empty timeline; the component
  tests draw one.
