<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0040: The times of an RPC are microseconds

Status: accepted

## Context

[0038](0038-the-diagnostics-view.md) reads the diagnostics of slurmctld
and takes the times of the remote procedure calls (RPCs), `total_time` and
`average_time`, to be microseconds. The vendored document says seconds for
them, and the capture of the diagnostics holds only zeros, so the record
left the unit unconfirmed.

## Decision

- **The times of an RPC in the diagnostics are microseconds**, as `sdiag`
  prints them. This record settles what 0038 left open; 0038 stays as it
  is.

## Why

On a sind cluster, Slurm 26.05, after the seed and 300 runs of `squeue`,
`sdiag` and `GET /slurm/v0.0.45/diag/` gave the same figures for
`REQUEST_JOB_INFO`:

| Source | count | ave_time | total_time |
| --- | --- | --- | --- |
| `sdiag` | 301 | 123 | 37137 |
| slurmrestd | 301 | 123 | 37137 |

`sdiag` prints microseconds. In seconds, 301 calls would have taken about
ten hours, which the run did not.

## Costs

- The vendored document keeps its wrong description. sdash does not edit a
  vendored document, so the wire struct names this record beside the field.
