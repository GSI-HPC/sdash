<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0031: End-to-end tests against slurmrestd start on Slurm 26.05

Status: accepted

## Context

[0016](0016-e2e-and-fixtures-on-sind.md) held all Slurm-facing work back
until sind runs a slurmrestd, and planned a CI matrix over Slurm 25.11 and
26.05. sind v0.11.0 added the `api` node, which runs slurmrestd with JWT
authentication, and v0.15.0 is the release `mise.toml` now pins. The node
comes with the 26.05 images only: `sind create cluster` fails for a 25.11 image
that has an `api` node. [0004](0004-slurm-25-11-is-the-floor.md) makes 25.11
the floor and asks for both releases.

A first run on a GitHub Actions runner, with Docker, showed that the host
reaches the api node at its address on port 6820, that `scontrol token`
gives root a token, and that the daemon serves `/slurm/` and, with a `db`
node, `/slurmdb/` in data_parser v0.0.45.

## Decision

- The gate of 0016 is open for 26.05. The end-to-end suite and the captures
  of specs and fixtures run on the cluster of `e2e/testdata/sind-cluster.yaml`
  with the 26.05 image, in the CI job `e2e`, and as `make e2e-up`,
  `make e2e`, `make e2e-capture` and `make e2e-down` on a machine with Docker.
- The job keeps what `e2e/capture.sh` wrote as an artifact. A spec or a
  fixture enters the tree by a commit of its own, copied from such an
  artifact.
- `e2e/seed.sh` puts a fresh cluster into one scenario, with fixed job ids,
  and the capture takes its answers after that.
- 25.11 has no leg until sind runs a slurmrestd on it. Until then nothing
  observed on 25.11 exists, and what [0004](0004-slurm-25-11-is-the-floor.md)
  says about its behaviour stays as read from documentation and source.

## Why

- Waiting for 25.11 as well would hold back all Slurm-facing work for a
  release line whose image may never carry a slurmrestd.
- The capture is data from a run, as 0016 asks, and a change in what Slurm
  sends shows as a difference in the next one.

## Costs

- Support for 25.11 cannot be checked against a cluster. The maintainer
  accepted that on 26.05 alone for now; a leg for 25.11 follows a sind that
  runs a slurmrestd there.
- The captures show one seeded scenario, small and fixed. The times in it
  are those of the run, so a fixture is normalised before it is compared.
