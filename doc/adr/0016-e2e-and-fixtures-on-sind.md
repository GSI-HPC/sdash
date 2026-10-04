<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0016: End-to-end tests, fixtures and specs come from sind clusters

Status: accepted

## Context

Nothing sdash knows about slurmrestd was observed on a live server:
[research/slurmrestd.md](../research/slurmrestd.md) is from documentation
and source. The mock data of the design handoff is written by hand, and
several of its field names differ from the spec. Captured responses and
specs exist in other projects, under their own licences
([research/slurmrestd.md](../research/slurmrestd.md#8-prior-art)).

[sind](https://github.com/GSI-HPC/sind) creates Slurm clusters in Docker and
publishes a node image for each release line, today 25.11 and 26.05.
clusterctl runs its end-to-end tests on it (its
[record 0024](https://github.com/GSI-HPC/clusterctl/blob/main/doc/adr/0024-end-to-end-tests-on-sind.md)).
sind does not run a slurmrestd yet
([sind issue 90](https://github.com/GSI-HPC/sind/issues/90)).

## Decision

- The end-to-end tests, every test fixture and every vendored slurmrestd
  spec come from runs against clusters that sind creates.
- The setup is clusterctl's: the sind command line and
  [sind-action](https://github.com/GSI-HPC/sind-action), the cluster's YAML
  under `e2e/testdata/`, `make e2e-up`, `make e2e` and `make e2e-down`,
  tests behind `//go:build e2e` that run the built binary, and a CI matrix
  over Slurm 25.11 and 26.05. `mise.toml` pins sind, for Linux alone.
- This gates all Slurm-facing development. Until sind runs a slurmrestd
  there is no Slurm-facing code, no fixture from any other source, and no
  use of `doc/design/sdash-data.js` as the truth about the API.
- What proceeds meanwhile: the scaffold, these records, the requirements
  for sind ([sind-requirements.md](../sind-requirements.md)), and the UI
  shell with its primitives.

## Why

- A fixture that a run produced can be produced again, for each release
  line, and a change in what Slurm sends shows as a difference.
- One substrate serves clusterctl and sdash. It is pinned, so a red run is a
  change in this repository and not a new sind.

## Costs

- All Slurm-facing work waits for a feature of another repository, and for
  the sind release that carries it. sdash's accounting views need slurmdbd
  there as well.
- The suite runs only on Linux with Docker. A contributor on macOS runs it
  in CI.
- sind builds the newest patch release of each line. Behaviour of an earlier
  patch level, such as a bug fixed since, cannot be captured without an
  image built for it.
- A sind cluster is small. Its fixtures show shapes, not the size of a
  production queue.
- Until the gate opens, nothing the UI shell shows can be checked against
  Slurm.
