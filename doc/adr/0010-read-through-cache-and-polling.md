<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0010: A read-through cache, and a browser that polls

Status: accepted

## Context

slurmrestd is stateless: each request becomes one or more RPCs to slurmctld
or slurmdbd, and SchedMD strongly encourages a caching layer in front of it.
The job list has no filter and no pagination, `update_time` is not a delta,
and nothing is pushed
([research/slurmrestd.md](../research/slurmrestd.md#3-polling-semantics-and-load)).
A job record is 6 to 8 KB in compact JSON and about 18 KB in slurmrestd's
default output, so a queue of 10,000 jobs is 75 to 190 MB for each poll. The
design handoff assumed 2.6 KB and offers refresh intervals of 2 and 5
seconds. Radar pushes changes to the browser over Server-Sent Events.

## Decision

The data flow is that of
[initial-conclusions.md](../initial-conclusions.md#6-slurm-client-and-data-flow).
In short:

- Each kind of data per cluster is a read-through cache with a minimum age
  and single-flight fetches.
- A background refresh runs only while a visible browser tab asks for that
  kind. Without a viewer sdash sends no request upstream.
- Jobs and nodes refresh every 30 seconds by default; partitions,
  reservations and QOS every 60; never faster than ten times the last
  fetch and decode. The 2 and 5 second options go, and the UI shows the age
  of what it displays. `update_time` is not used.
- An accounting query always carries a time window.
- The browser polls the local server: a small `pulse` endpoint with a
  generation counter per kind, after which it fetches what changed. Lists
  are filtered, sorted and windowed on the server.
- There are no Server-Sent Events in the first versions.
- A write is never retried automatically, and after it only the entity it
  touched is fetched again.

## Why

- The upstream is polled in any case, so a push to the browser would only
  forward what a poll found.
- Each event stream holds one of the browser's six connections per origin,
  and a hidden tab with an open stream would keep sdash polling slurmctld.

## Costs

- What the UI shows is up to 30 or 60 seconds old, and older on a large
  queue. A user cannot ask for a faster refresh than the adaptive floor.
- The Go process holds each whole collection in memory to filter and sort
  it.
- Every sdash process polls for itself. Ten users watching the queue are
  ten job-list requests per interval
  ([0001](0001-local-first-binary-with-embedded-ui.md)).
- The intervals are estimates. Nothing was measured against a live cluster,
  and the first spike has to measure bytes and seconds per poll.
