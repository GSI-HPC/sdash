<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0001: A local-first binary with an embedded UI

Status: accepted

## Context

sdash is a browser UI for Slurm's REST API, for a handful of users and
administrators at first, not for everyone. A UI of this kind is usually a
service the site deploys: Slurm-web is an agent, a gateway and a frontend
behind one service identity, with a permission system of its own
([research/slurmrestd.md](../research/slurmrestd.md#8-prior-art)).

[Radar](https://github.com/skyhook-io/radar) does the same job for Kubernetes
in another shape: one static Go binary that embeds its single-page app, binds
loopback, opens the browser and acts with the credentials of the person who
started it. [research/radar.md](../research/radar.md) records how it is built.

## Decision

- sdash is one static Go binary, `sdash`, with a React single-page app
  embedded through `go:embed`.
- It binds loopback, prints its URL, opens the browser, and then connects to
  slurmrestd, so that the progress of the connection shows in the UI.
- It acts under the user's own Slurm identity. slurmctld and slurmdbd
  enforce what that user may do. There is no service account and no second
  permission system.
- There is no desktop shell and no site-hosted multi-user service.
- Radar is the model for the shape and the look. sdash takes patterns only:
  no code is ported from Radar.
  [initial-conclusions.md](../initial-conclusions.md#3-from-radar-adopt-change-skip)
  lists what is adopted, changed and skipped.
- The embed directory holds a tracked placeholder, so that `go build ./...`
  works on a checkout without Node.

## Why

- Nobody has to deploy anything. A user downloads one file and runs it where
  a route to slurmrestd exists.
- Slurm already decides who may see and change what. A service identity
  would need a second set of rules kept in step with Slurm's.
- Radar's desktop app needs CGO, a native build runner per operating system
  and code signing, for the same UI and API
  ([research/radar.md](../research/radar.md#2-desktop-app)).

## Costs

- Nothing is shared between users. Each process holds its own cache and
  makes its own requests to slurmrestd
  ([0010](0010-read-through-cache-and-polling.md)).
- Each user needs a route to slurmrestd and a token of their own
  ([0006](0006-direct-or-through-ssh.md), [0007](0007-jwt-and-the-token-source.md)).
- On a shared login node other local users can reach a loopback port, so
  loopback alone is no boundary, and several of Radar's defaults are wrong
  there ([research/radar.md](../research/radar.md#6-what-not-to-copy),
  [0012](0012-local-listener-security.md)).
- There is no central instance to update. A release reaches a user when the
  binary they run is replaced.
