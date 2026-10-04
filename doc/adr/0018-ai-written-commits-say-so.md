<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0018: A commit written by an AI agent says so

Status: accepted

## Context

sdash is developed with the help of AI coding tools, as its siblings are.
sind, go-clikit and go-nodeset say so in their READMEs and point at the
marks their commits carry; clusterctl carries the marks without the
statement.

How an agent marks its commits is usually set outside the repository, in the
personal configuration of whoever runs it. Such a configuration may say the
opposite of what a project wants, for example that the agent's name stays
out of commits.

## Decision

- A commit written by Claude Code is authored as
  `Claude <noreply@anthropic.com>` and carries a `Co-Authored-By: Claude …`
  trailer, which may name the model as the siblings' commits do. Both are
  kept.
- In this repository this rule overrides a contributor's personal defaults.
  Whatever a contributor's own or global agent instructions say about
  attribution, a commit an agent wrote for sdash keeps the author and the
  trailer.
- The README has a section `## AI disclosure`, in go-clikit's words: "This
  project is developed with the help of AI coding tools. Changes written by
  Anthropic's Claude Code agent are committed as
  `Claude <noreply@anthropic.com>` and/or carry a `Co-Authored-By: Claude …`
  trailer."
- [AGENTS.md](../../AGENTS.md) repeats the rule where an agent reads it:
  "Keep both; the README AI disclosure relies on them."

Where the trailer stands in the message is in
[0017](0017-main-only-rebase-merge-conventional-commits.md).

## Why

- The README makes a statement to the public about every commit. It is true
  only for as long as the commits carry the marks.
- A reader of `git log` can tell which changes an agent wrote without
  asking anyone.

## Costs

- The author of such a commit is a tool, not the person who ran it and
  answers for the change. That person is found in the pull request.
- A contributor has to check that their own setup does not strip the marks.
  A personal default wins silently when the agent does not read
  `AGENTS.md`.
- The rule names one agent. A commit written with another tool has no rule
  here yet.
- Nothing checks it. A commit an agent wrote under a person's name looks
  like any other.
