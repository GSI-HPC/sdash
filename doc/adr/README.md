<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Decisions

One file per decision, in the order they were taken. A record says what the
situation was, what was decided, and what that costs, not what would have been
nice.

A decision is superseded by a later record, never edited; the one line that
changes is its status. A record whose status is proposed states a position the
maintainer has not confirmed; merging the change that adds it does not accept
it.

The first 22 were written together on 2026-10-03, before any code, and are
ordered by subject.

| | Decision | Status |
| --- | --- | --- |
| [0001](0001-local-first-binary-with-embedded-ui.md) | A local-first binary with an embedded UI | accepted |
| [0002](0002-apache-2-0-and-reuse.md) | Apache-2.0, REUSE, and GSI holds the copyright | accepted |
| [0003](0003-http-to-an-existing-slurmrestd.md) | HTTP to an existing slurmrestd, and nothing else | accepted |
| [0004](0004-slurm-25-11-is-the-floor.md) | Slurm 25.11 is the floor | accepted |
| [0005](0005-versions-releases-and-capabilities.md) | Parser versions, Slurm releases and named capabilities | accepted |
| [0006](0006-direct-or-through-ssh.md) | Reach slurmrestd directly or through the system ssh | accepted |
| [0007](0007-jwt-and-the-token-source.md) | JWT, and where the token comes from | accepted |
| [0008](0008-user-agent.md) | Every upstream request names sdash and its version | accepted |
| [0009](0009-one-tolerant-wire-model.md) | One tolerant wire model, not a generated client per version | accepted |
| [0010](0010-read-through-cache-and-polling.md) | A read-through cache, and a browser that polls | accepted |
| [0011](0011-openapi-first-browser-api.md) | The browser API is written as an OpenAPI document first | accepted |
| [0012](0012-local-listener-security.md) | The local listener trusts neither the host nor the browser | accepted |
| [0013](0013-frontend-stack.md) | The frontend stack | accepted |
| [0014](0014-accessibility-and-browsers.md) | WCAG 2.1 AA, a browser list, and no pixel accuracy | accepted |
| [0015](0015-how-tests-are-written.md) | How tests are written | accepted |
| [0016](0016-e2e-and-fixtures-on-sind.md) | End-to-end tests, fixtures and specs come from sind clusters | accepted |
| [0017](0017-main-only-rebase-merge-conventional-commits.md) | `main` only, rebase-merged, in Conventional Commits | accepted |
| [0018](0018-ai-written-commits-say-so.md) | A commit written by an AI agent says so | accepted |
| [0019](0019-version-in-a-signed-tag.md) | The version lives only in a signed tag | accepted |
| [0020](0020-go-lines-tools-and-libraries.md) | Go lines, pinned tools and the libraries sdash starts with | accepted |
| [0021](0021-decisions-docs-and-agent-instructions.md) | Where decisions, documents and agent instructions live | accepted |
| [0022](0022-repository-security-baseline.md) | The security baseline of the repository | accepted |
| [0023](0023-the-listeners-as-built.md) | The listeners as built | accepted |
| [0024](0024-addresses-and-keyboard-in-the-shell.md) | Addresses and the keyboard in the shell | accepted |
