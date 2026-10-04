<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0009: One tolerant wire model, not a generated client per version

Status: accepted

## Context

slurmrestd publishes an OpenAPI document per parser version, and SchedMD
advises generating a client from it and keeping the generated code. For sdash
that is one generated package per supported parser
([0004](0004-slurm-25-11-is-the-floor.md)) and a mapper for each.

The figures are in
[research/slurmrestd.md](../research/slurmrestd.md#5-openapi-specification)
and [initial-conclusions.md](../initial-conclusions.md#5-version-story):
about 41,000 generated lines for v0.0.44 and v0.0.45 together, against two
type changes in about 1,860 property paths across four parser versions, one
of them between the two supported ones. Decoding 100,000 job records peaked
at about 2 GB with the generated types and at 107 MB with a hand-written
struct decoded as a stream. The spec is also wrong in at least one place:
for the job state query it declares integer job ids where the handler sends
strings.

## Decision

- One set of hand-written wire structs serves every parser version. It holds
  the union of the fields sdash uses, and no upstream client is generated.
- On a read, unknown fields are ignored. A field the negotiated parser lacks
  is passed on as unavailable, not as zero.
- A request body is built for the negotiated parser and never holds a field
  or an enum value that parser lacks. slurmrestd's "Ignoring unknown field"
  warning on a write counts as a failure.
- Large collections are decoded as a stream, one element at a time. An
  upstream error is classified by Slurm's `error_number` first and by the
  HTTP status second, because the status mapping differs between releases.
- The vendored spec of each parser is what the structs are checked against,
  by the conformance test of
  [0005](0005-versions-releases-and-capabilities.md).
- The browser never sees a slurmrestd shape. The wire structs are mapped to
  a version-neutral model first.

## Costs

- The compiler does not know whether a field exists in a parser version. The
  conformance test stands in for it, and covers only the paths it is told
  to walk.
- Every field sdash reads is added by hand, and a type that changes between
  versions needs a decoder of its own; `partition_info.cpus.task_binding` is
  the one today.
- Enum vocabularies change more often than types, eight times between
  v0.0.44 and v0.0.45, so the fix-ups and tests have to cover values too.
- It goes against SchedMD's advice. A change in a new parser is found by the
  conformance test and the fixtures of
  [0016](0016-e2e-and-fixtures-on-sind.md), not by a build that fails.
- The measurements were taken on replicated fixture records, not on a
  production cluster.
