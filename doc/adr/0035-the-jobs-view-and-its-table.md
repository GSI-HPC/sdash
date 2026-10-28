<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0035: The Jobs view and its table

Status: proposed

## Context

[0034](0034-cluster-data-in-the-browser-api.md) serves the jobs of a
cluster a page at a time, filtered and sorted on the server, beside a
pulse that says how far each kind of data has got. The Jobs view is the
first view to show them, and the first to need a table, which
[0030](0030-primitives-that-show-data.md) left to a later change and
[0013](0013-frontend-stack.md) meant to window with react-virtuoso.
[0024](0024-addresses-and-keyboard-in-the-shell.md) left open whether the
address names the cluster a view shows. The browser tests ran one sdash,
without a cluster, and a view of cluster data had nothing to show there.

## Decision

- **The table** is a primitive, `Table`, on a native `table`: a header
  cell with `scope="col"` for each column, the name of the table as its
  caption, and in the header of a column that sorts a button, with
  `aria-sort` on the header of the column the rows are sorted by. It
  sorts nothing itself; the caller hands in the rows in their order. A
  table wider than its box scrolls sideways inside it.
- **Pages, not a window.** The view shows 50 jobs at a time and asks the
  server for the next 50, with buttons for the page before and after. The
  page is in the address. No list is windowed, and react-virtuoso is not
  added.
- **The cluster is in the address**, as the query parameter `cluster`
  with the name the profile file gives it. An address without it shows
  the first cluster of the file, so every address written so far keeps
  working. A name the file does not have is said to be unknown, with the
  names it has.
- **Polling.** A view of cluster data asks for the pulse of its kinds
  every 10 seconds while the page is visible, which keeps them watched,
  and asks for its page again when the pulse reports a newer generation
  than the page was cut from. It shows the page it had while it waits. It
  says how old its data are, from the time sdash fetched them.
- **Failures** are told in words for the code of the Error: a read with
  nothing to give is an error panel in place of the table, a read whose
  data are older than a failed fetch is a banner above it, with the
  message of slurmrestd's answer below the words.
- **The browser tests run two sdash**: one without a cluster, as before,
  and one whose profile file names the cluster of a fake slurmrestd,
  `bin/slurmrestdtest`. The fake is the one the Go tests use, run as a
  program: it answers with the captures of a sind cluster
  ([0016](0016-e2e-and-fixtures-on-sind.md)), writes the profile file,
  and prints where it is.

## Why

- The server holds the whole list and gives a page of it in one answer;
  a window over a list the browser does not hold would need a request for
  each stretch it scrolls to. A page of 50 rows is short enough for a
  native table, which assistive technology reads without help.
- A button in the header, and not a header that is pressed, is what the
  keyboard reaches and what a screen reader says can be pressed. WAI-ARIA's
  sortable table pattern does the same.
- A cluster in the query string leaves every path as it is, as
  [0024](0024-addresses-and-keyboard-in-the-shell.md) asks, and a link
  still names what it shows.
- The pulse is a few hundred bytes. Asked three times a period, the view
  shows a change a few seconds after sdash has it; the jobs themselves are
  read once for each change.
- An empty list that stands for a refused token says that there are no
  jobs; the words of the code say what is wrong instead.
- Captures taken through a running slurmrestd are the only fixtures sdash
  takes. A fake that serves them as a process gives the browser tests a
  cluster without Docker, in every engine.

## Costs

- A user reads the jobs page by page and cannot scroll past the 50th. A
  page boundary can move between two reads when jobs come and go.
- The address of a view does not say which cluster it shows until the
  user has chosen one, and the first cluster of the file can change with
  the file.
- Every open tab asks for the pulse every 10 seconds, even when nothing
  changes.
- `bin/slurmrestdtest` reads the captures from the sources of the
  checkout it was built in, and works nowhere else.
- The fake has the eight jobs of the seeded cluster. What the view does
  with thousands of jobs is not tested in a browser.
