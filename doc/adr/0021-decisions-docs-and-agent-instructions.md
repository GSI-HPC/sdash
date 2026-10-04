<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0021: Where decisions, documents and agent instructions live

Status: accepted

## Context

sdash had more than twenty decisions before it had code, and coding agents
write changes to it, following what the repository tells them. The siblings
keep decisions and instructions in different places. Decisions are one
file each in clusterctl and one `doc/decisions.md` in go-clikit and
go-nodeset. Agent instructions are a `CLAUDE.md` with skills under
`.claude/skills/` in sind, and an `AGENTS.md` with skills under
`.agents/skills/` in the two newer repositories.

## Decision

Decisions:

- One file per decision, `doc/adr/NNNN-slug.md`, with the index in
  [README.md](README.md), as clusterctl.
- A record has the title `# NNNN: Title`, a `Status:` line, `## Context`,
  `## Decision`, an optional `## Why`, and `## Costs`.
- A decision is superseded by a later record, never edited; the one line
  that changes is its status. A change that takes a decision adds its record
  in the same pull request.

Documents:

- The directory is `doc/`, singular, and [doc/README.md](../README.md) is
  its index. The UI design handoff lives in `doc/design/`, the studies in
  `doc/research/`, the first architecture position in
  `doc/initial-conclusions.md`.
- A change of behaviour updates the document that describes it in the same
  pull request.
- Prose is plain British English, wrapped by hand at about 80 columns in
  new documents, without em dashes and without emoji.
- There is no `CONTRIBUTING.md`, no changelog and, for now, no documentation
  site.

Agents:

- [AGENTS.md](../../AGENTS.md) is the source. `CLAUDE.md` is a short file
  that imports it with `@AGENTS.md`.
- Skills live in `.agents/skills/<name>/SKILL.md`, and `.claude/skills` is a
  tracked relative symlink to `../.agents/skills`. The first four are
  `steward`, `add-slurm-release`, `verify-ui` and `new-view`.
- An agent opens pull requests against `main`, and updates a branch by
  rebasing it onto `main` and `git push --force-with-lease`. It never
  pushes to `main`, creates a tag or a release, or merges a pull request.
  It asks the maintainer before commenting on an issue or a pull request,
  and never @-mentions anyone.

## Why

- One file per record, because there are 22 of them at the start;
  clusterctl, the other application, has 25.
- `AGENTS.md` is read by coding agents in general. The agent that
  [0018](0018-ai-written-commits-say-so.md) names reads `CLAUDE.md` and
  takes skills from `.claude/skills` only, hence the import and the link.

## Costs

- The first position and the records overlap. Where they differ the record
  holds, and the position is not edited to match.
- A superseded decision is read in two files.
- A checkout that cannot make symlinks sees `.claude/skills` as a text
  file.
- Every merge, tag, release and comment is the maintainer's to make.
