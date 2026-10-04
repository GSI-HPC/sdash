<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0003: HTTP to an existing slurmrestd, and nothing else

Status: accepted

## Context

A program can read a Slurm cluster in two ways: through the command line
tools, whose output it parses, or through slurmrestd, the REST daemon. The
terminal UIs turm and stui do the first, Slurm-web and s9s the second
([research/slurmrestd.md](../research/slurmrestd.md#8-prior-art)).

A program that uses slurmrestd can also bring its own: start a slurmrestd
beside itself where the Slurm installation allows it. And it can mix the two,
taking from the command line what the REST API lacks. Both were proposed for
sdash ([initial-conclusions.md](../initial-conclusions.md#12-what-the-review-changed)).

slurmrestd lacks several things a dashboard wants: an event stream, the
content of a job's output files, a permission query, a rack layout and GPU
utilisation
([research/slurmrestd.md](../research/slurmrestd.md#6-what-slurmrestd-does-not-offer)).

## Decision

- sdash connects to a slurmrestd that the site already operates. It never
  starts, configures or manages one.
- All Slurm data and every action go over HTTP to that slurmrestd. There is
  no fallback to the Slurm command line for data.
- A feature that slurmrestd cannot serve waits until slurmrestd can.

The one Slurm command sdash may run is the token command a user configures
([0007](0007-jwt-and-the-token-source.md)), which fetches a credential and no
data.

## Why

- sdash needs no Slurm installation, no `slurm.conf` and no munge or sackd
  on the machine it runs on, only a route to the endpoint
  ([0006](0006-direct-or-through-ssh.md)).
- There is one upstream interface to model
  ([0005](0005-versions-releases-and-capabilities.md)) and to test
  ([0016](0016-e2e-and-fixtures-on-sind.md)), and it publishes its own schema.
- The slurmrestd a user reaches is the one whose exposure and authentication
  the site decided.

## Costs

- What slurmrestd does not offer, sdash does not offer: no job output, no
  push of changes, nothing that needs a shell on a node.
- On Slurm 25.11 there is no view of `slurm.conf`, no requeue and no
  partition drain or resume over REST; those need 26.05
  ([research/slurmrestd.md](../research/slurmrestd.md#9-corrections-to-the-design-handoff)).
- sdash is of no use at a site that runs no slurmrestd, or does not let its
  users reach one.
- The site's configuration bounds sdash: the parser versions slurmrestd
  loads, its output format and slurmctld's rate limit are not sdash's to
  change.
