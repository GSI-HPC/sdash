<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0004: Slurm 25.11 is the floor

Status: accepted

## Context

slurmrestd names the JSON schema it speaks in the URL path, as a data_parser
version (`/slurm/v0.0.44/...`). Each Slurm release ships four parser
versions, and the newest of them is new in that release: 25.11 ships v0.0.41
to v0.0.44, 26.05 ships v0.0.42 to v0.0.45. The handlers behind a parser are
not versioned, so the same path can behave differently on two releases
([research/slurmrestd.md](../research/slurmrestd.md#1-releases-and-data_parser-versions)).

Clusters on 25.11 and on 26.05 exist today. The design handoff targets
v0.0.45 alone, which needs 26.05.

## Decision

- The minimum Slurm release is 25.11. sdash supports 25.11 and every later
  release, which means data_parser v0.0.44 and later.
- sdash speaks the newest parser version it knows that the server offers:
  v0.0.44 on 25.11, v0.0.45 on 26.05. The UI adapts to what the connected
  cluster's REST API offers
  ([0005](0005-versions-releases-and-capabilities.md)).
- A release is dropped when SchedMD's support for it has ended and no own
  cluster runs it. Both have to hold.

## Costs

- A site on 25.05 or older cannot use sdash. 25.05 was still receiving
  maintenance releases when this was decided.
- Two releases are supported from the first day, and they differ in more
  than the schema: a request slurmctld rejects is HTTP 500 on 25.11 and 422
  on 26.05. Everything Slurm-facing is tested on both
  ([0016](0016-e2e-and-fixtures-on-sind.md)).
- On 25.11 the features that need v0.0.45 are missing: requeue, changes to
  partitions and the view of `slurm.conf`. The UI shows them disabled and
  says why.
- A release SchedMD no longer supports stays for as long as an own cluster
  runs it, with its parser directory, its release file and its leg of the CI
  matrix.
- SchedMD removes v0.0.44 in 27.11 by its published dates, which have moved
  once already. The floor's parser therefore has an end that sdash does not
  set.
