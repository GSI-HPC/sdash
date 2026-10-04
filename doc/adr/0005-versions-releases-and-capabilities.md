<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0005: Parser versions, Slurm releases and named capabilities

Status: accepted

## Context

sdash supports several Slurm releases at once
([0004](0004-slurm-25-11-is-the-floor.md)), and two things vary between them
independently. The data_parser version decides the schema. The Slurm release
of the server decides behaviour: status codes, bugs and which methods are
bound. A 26.05 server can be asked for v0.0.44, fixes land in maintenance
releases, a site may load only some parsers, and endpoints are backported
([research/slurmrestd.md](../research/slurmrestd.md#1-releases-and-data_parser-versions)).
A table keyed on the parser version alone is therefore wrong, and version
comparisons spread through handlers and UI code make every new release a
search.

## Decision

The design is that of
[initial-conclusions.md](../initial-conclusions.md#5-version-story), which
also shows the package layout. Its rules:

- **Two keys, two places.** Schema material is keyed on the parser version
  and lives in one directory per parser: the vendored spec, paths, field and
  enum fix-ups, response fixtures. Behaviour is keyed on the Slurm release
  and lives in one file per release. A connection combines one of each, and
  reads the release from the server, never from the parser.
- **Negotiation.** sdash speaks the newest parser it knows that the server
  offers. A release newer than it knows is reached through that parser with
  the behaviour of the newest known release, and the cluster is marked as
  newer than tested. A server that offers no known parser is refused.
- **Capabilities.** No other code mentions a version. Handlers, services
  and the UI ask for a named capability (`job.requeue`, `conf.read`), and a
  test fails when a version comparison appears outside the version packages.
- **Evaluated against the server.** A capability requires bound operations,
  schema elements, or a minimum release. The first two are checked against
  the server's own `/openapi/v3`, with the vendored spec as the fallback,
  the third against the release file. An unavailable capability carries its
  reason.
- **One gate in the UI.** The backend serves the capability set per cluster
  and the frontend gates with one hook. What the user's role lacks is
  hidden; what the cluster lacks is shown disabled with the reason.
- **A conformance test** walks every vendored spec: each path and enum value
  the wire structs use must exist with a compatible type or be listed as
  absent. It regenerates the support matrix, capability by release, which
  is committed.
- **Adding a release is a checklist**, the `add-slurm-release` skill: vendor
  the spec, run the conformance test, capture fixtures, add quirks and
  capabilities, regenerate the matrix, extend the CI matrix and the
  registry. Dropping one deletes its directory and its file.

## Costs

- A Slurm-facing feature needs a capability with its requirements before it
  has a handler or a button.
- Every connection reads the server's `/openapi/v3`, about 2 MB on a default
  server, before the UI knows what it may offer.
- A release newer than sdash knows runs with a behaviour profile nobody
  tested against it. sdash says so and does not refuse.
- A release is added by hand twice a year, and its spec and fixtures come
  only from a sind cluster ([0016](0016-e2e-and-fixtures-on-sind.md)).
- None of this is observed yet: the facts it rests on are from source and
  documentation, not from a live slurmrestd.
