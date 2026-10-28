<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0034: The data of a cluster in the browser API

Status: proposed

## Context

[0010](0010-read-through-cache-and-polling.md) decided how cluster data
reach the browser: a read-through cache for each kind of data, fetched only
while a browser asks for it, and a small pulse that the browser polls
before it fetches what changed, with lists filtered, sorted and windowed on
the server. [0009](0009-one-tolerant-wire-model.md) keeps slurmrestd's
shapes from the browser. [0032](0032-the-slurm-client-as-built.md) left the
model and the cache to the first views that need them. The browser API had
two operations, neither with a parameter, and the generated server needed no
module of its own ([0020](0020-go-lines-tools-and-libraries.md)).

## Decision

- **Packages.** `internal/slurm/model` holds sdash's own `Job`, `Node` and
  `Partition`, mapped from the wire as each element is decoded, and the
  query that filters, sorts and windows a list of jobs.
  `internal/slurm/cache` is the read-through cache of one kind.
  `internal/clusters` builds, for each cluster of the profile file
  ([0033](0033-the-profile-file.md)), its client, its connection and a cache
  for its jobs, its nodes and its partitions.
- **Nothing is sent at start.** A cluster connects when a kind of its data
  is first asked for, one attempt at a time; an attempt that failed is
  made again with the next fetch, and a connection whose server no longer
  offers what it was made for is made anew.
- **The cache.** A read or a pulse that names a kind leases it for two
  periods. While the lease lasts, the kind is fetched once a period, one
  fetch at a time, with the context of the cache, so that a reader that
  goes away does not end a fetch another reader waits for. The period is
  30 seconds for jobs and nodes and 60 for partitions, and at least ten
  times the last fetch. The generation of a kind grows only when a fetch
  brings data that differ from those held. A failed fetch leaves the data
  held in place and reports the failure beside them. A read with nothing
  held waits for the first fetch, and a failure with nothing held is not
  tried again within a period.
- **The operations**, all under `/api/v1/clusters/{cluster}/`:
  `pulse?kinds=…` (the connection: whether it was made, the release, the
  parser, whether that release line was tested, the user the token names,
  the failure of the last attempt; and for each kind its generation, the
  time of its fetch, its period and its failure), `jobs` (with `state`,
  `user`, `partition`, `q`, `sort`, `order`, `offset` and `limit`, and with
  the counts of states, users and partitions over the whole list),
  `nodes` and `partitions` (whole). `status` lists the clusters of the
  profile with their endpoints.
- **A member that slurmctld leaves unset, or sets to nothing, is absent**
  from an answer, never null and never an empty string. A time limit that
  is unlimited is absent too.
- **Failures.** The kinds of failure of the client become five codes of the
  Error: `unauthenticated`, `forbidden`, `unavailable`, `unsupported` and,
  for the rest, `upstream`. A read with nothing to give answers with the
  status 502 and that Error; a read with older data gives them, with the
  Error in their member `error`. The message is the client's, which names
  the request and what slurmrestd said, and never holds the token.
- **The generated server binds parameters with
  `github.com/oapi-codegen/runtime`**, which the first path and query
  parameters make a direct requirement. It requires
  `github.com/google/uuid` and `github.com/apapsch/go-jsonmerge/v2`.

## Why

- A browser that holds a page of ten thousand jobs is slower than one that
  asks the server for the fifty it shows, and the server holds the list in
  any case.
- A generation that grows on every fetch would have the browser read an
  unchanged list every period.
- An empty list that stands for a refused token tells the user that they
  have no jobs; the code tells the interface what to say instead.
- Writing the binding of parameters by hand would mean leaving the
  generated router, which keeps the API and its document in step.

## Costs

- Three more modules, which come with the generator's choice of runtime.
- The counts of a page are over the whole list, not over what the other
  filters keep, so a count can promise more than a filter then shows.
- The nodes and the partitions come whole, without a window. A cluster of
  many thousand nodes sends them all with each change.
- A browser tab that is hidden stops asking, and the kinds it asked for are
  fetched for up to two periods more.
- Capabilities ([0005](0005-versions-releases-and-capabilities.md)) are not
  built yet: reading jobs, nodes and partitions is offered by every release
  sdash speaks, so none of these operations needs one.
