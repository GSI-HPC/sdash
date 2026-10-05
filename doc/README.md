<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# sdash documentation

This directory records how sdash is built and why, for someone who changes
it. What sdash is, what state it is in and how to build it is in the
[README](../README.md).

| Document | What it covers |
| --- | --- |
| [initial-conclusions.md](initial-conclusions.md) | The first architecture position, dated 2026-10-03: product shape, connectivity, the version story, data flow, local security, frontend. It is not kept up to date; where a decision record differs, the record holds |
| [research/radar.md](research/radar.md) | How Radar, the model for sdash's shape and look, ships a UI as one binary, what it is built from, and what not to copy |
| [research/slurmrestd.md](research/slurmrestd.md) | The slurmrestd facts sdash depends on: releases and parser versions, authentication, polling and payload sizes, errors, the OpenAPI document, and the corrections to the design handoff. From documentation and source, not from a live server |
| [design/](design/) | The UI design handoff: the reference for look and interaction only. Its statements about the API are corrected in [research/slurmrestd.md](research/slurmrestd.md#9-corrections-to-the-design-handoff) |
| [adr/](adr/) | The decisions, one record each: what the situation was, what was decided, and what it costs |
| [ui.md](ui.md) | The shell of the UI, for whoever builds a view: the address of each view, what happens to the title and the focus, how keyboard shortcuts are registered, what the command palette lists, the sizes of the layout, and every place where it departs from the design handoff |
| [sind-requirements.md](sind-requirements.md) | What sdash needs from sind before any Slurm-facing work can start: what it will do with a sind cluster, each requirement with its reason and its check, and what it does not need |
| [testing.md](testing.md) | What is tested and how: the Go tests, the frontend's three layers, the end-to-end suite on sind, and how each is run |
| [release.md](release.md) | Cutting and verifying a release: the signed tag, its notes, the workflow, and what the maintainer sets up once |

## Everything else

| For | Where |
| --- | --- |
| A contributor, person or agent | [AGENTS.md](../AGENTS.md): layout, commands, conventions and rules |
| Someone reporting a vulnerability | [SECURITY.md](../SECURITY.md) |
| Someone who needs the licence of a file | [LICENSE](../LICENSE), the two SPDX lines each file starts with, and [REUSE.toml](../REUSE.toml) for the files that cannot hold a comment |
| Someone citing sdash | [CITATION.cff](../CITATION.cff) |

## Keeping it true

- A change that takes a decision adds its record under `adr/` and a line to
  [adr/README.md](adr/README.md), in the same pull request.
- A decision is never edited; a later one supersedes it, and the one line
  that changes is its status.
- A change of behaviour updates the doc comments, and the document here that
  describes it, in the same pull request.
- `initial-conclusions.md` is dated and is not brought up to date. Where a
  record differs from it, the record holds.
- `make lint-docs` and `make reuse` check every document, and CI runs both;
  the Markdown lint leaves out `design/`, which is kept as it was delivered.

Deliberately absent: a changelog, a `CONTRIBUTING.md` and, for now, a
documentation site. The signed tags, the README's Contributing section and
`AGENTS.md` say what the first two would.
