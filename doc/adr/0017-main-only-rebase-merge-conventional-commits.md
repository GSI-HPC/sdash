<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0017: `main` only, rebase-merged, in Conventional Commits

Status: accepted

## Context

The siblings differ. sind has `main` and `next` and merges pull requests
with merge commits. clusterctl, go-clikit and go-nodeset have `main` alone
and rebase-merge. All four write Conventional Commits, but not with the same
set of types. The commit list of a release is built from the commits on
`main`, grouped by type ([0019](0019-version-in-a-signed-tag.md)), so each of
them is read by someone deciding whether to take a release.

## Decision

Branches:

- `main` is the only long-lived branch.
- A pull request is rebase-merged onto a linear `main`: no squash and no
  merge commit. Every commit of a pull request therefore lands as it is and
  has to be a clean Conventional Commit by itself.
- An agent's branch is named `claude/<topic>`. A branch is brought up to
  date by rebasing it onto `main`, never by merging `main` in.

Commits:

- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`.
- The scope is the Go package for a Go change. Frontend and API changes use
  a short fixed list: `web`, `api`, and package-like names under `web/src`
  where one says more.
- The subject is lower-case and imperative, without a full stop. `!` marks a
  breaking change.
- The body is a short paragraph on the need, then bullets for what changed
  and why. It carries no development narrative.
- An issue reference (`Closes #N`, `Fixes #N`, `Refs #N`) is the last
  paragraph of the body. A blank line follows, then the trailers
  ([0018](0018-ai-written-commits-say-so.md)).

## Why

- The blank line matters. With a reference directly above the trailers git
  parses no trailers at all, which happened in 65 of clusterctl's commits.
- The types are those of go-clikit and go-nodeset, and `perf`, which
  clusterctl uses often and an application needs. There is no `chore` and
  no `style`.

## Costs

- A branch is tidied before it merges. A fix-up commit is folded into the
  commit it corrects by hand, since no squash does it at merge time.
- Rebasing rewrites the commits, so a branch under review is force-pushed
  and the hashes on `main` are not those the review saw.
- Nothing on `main` records which commits came in together. The pull
  request on GitHub is the only place that says.
- The merge method and the rule that keeps `main` linear are repository
  settings, set by the maintainer and visible in no file.
