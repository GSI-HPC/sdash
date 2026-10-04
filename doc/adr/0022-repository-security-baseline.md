<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0022: The security baseline of the repository

Status: accepted

## Context

sdash holds a user's Slurm token at run time and is built from Go modules,
npm packages and GitHub Actions, all of which age. Among the siblings,
go-clikit has the most: govulncheck, Dependabot and private vulnerability
reporting. None has code scanning or secret scanning switched on. Part of
such a baseline is files in the tree; the rest is settings of the repository
on GitHub, which no pull request can change or show.

## Decision

The repository is public from the first commit. Nothing in the tree is
personal data, a site's host name or a token.

In the tree:

- govulncheck runs in CI and as `make vuln`.
- Dependabot proposes updates for Go modules and npm packages, minor and
  patch releases grouped, and for GitHub Actions one pull request each, only
  once a release has been out for seven days; GSI-HPC's own modules and
  security updates do not wait (`.github/dependabot.yml`).
- `web/.npmrc` gives an `npm install` run by hand the same seven days, and
  lets no npm package run a script of its own when it is installed.
- [SECURITY.md](../../SECURITY.md) is short and asks for private reports.
- Actions are pinned by major tag, as in all four siblings.
- The workflows are read-only at the top. In the release workflow only the
  publishing job has write permissions.

Settings the maintainer switches on, because no file can:

1. private vulnerability reporting, which `SECURITY.md` points at;
2. secret scanning, with push protection;
3. CodeQL code scanning, in its default setup.

## Why

- The seven days give a compromised or broken release time to be found out
  before it is proposed here.
- A public history cannot be cleaned quietly, so the rule against host
  names and tokens holds from the first commit, not from the first release.

## Costs

- A major tag can be moved. Pinning by tag trusts every publisher of an
  action to keep theirs where it is.
- The three settings live outside the tree. Nothing in a checkout shows
  whether they are on, and a fork does not inherit them.
- sdash is the first of the five repositories with CodeQL and secret
  scanning, so none of them has experience with what the two report.
- govulncheck can fail a pull request that changed nothing, when a new
  advisory covers the standard library or a requirement.
- `web/.npmrc` applies the seven days to every resolution, Dependabot's
  included, so its security update for an npm package may fail inside that
  week and is then made by hand.
- Dependabot's pull requests are merged by the maintainer, weekly. An
  update to an action only the release workflow uses is exercised by the
  next release, not by its pull request.
- Examples, fixtures and logs have to be free of site names. Fixtures come
  from sind clusters, which have none
  ([0016](0016-e2e-and-fixtures-on-sind.md)).
