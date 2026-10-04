---
name: steward
description: Drive an sdash pull request to a mergeable state. Covers the local checks to run before every push, updating the branch by rebasing onto main, and triaging the CI jobs. Use when opening, updating, or watching a PR in this repository.
---

<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Steward an sdash PR

## Base branch

- Every PR targets `main`. One logical change per PR. Agent branches are
  named `claude/<topic>`.

## Before every push

1. `make lint` reports 0 issues.
2. `make test` and `make floor` pass: the Go tests under the race detector,
   and vet and tests with the Go release `go.mod` names.
3. `make lint-ui` passes: ESLint and Prettier on the frontend.
4. `make test-ui` passes: the frontend's unit tests.
5. `make generate` leaves the tree unchanged. A change to the browser API
   starts in `api/openapi.yaml`, and the regenerated Go and TypeScript are
   committed with it (`doc/adr/0011-openapi-first-browser-api.md`).
6. `make tidy` leaves `go.mod` and `go.sum` unchanged. A new direct Go
   requirement or npm runtime dependency is a decision record of its own
   (`doc/adr/0020-go-lines-tools-and-libraries.md`).
7. `make reuse` passes (`pip install reuse`).
8. `make lint-docs` passes.
9. If `.github/` changed: `actionlint`, `shellcheck .github/scripts/*.sh` and
   `make test-release`, which needs `ssh-keygen` and `gpg`.
10. If the UI changed: `make test-components` passes, the component tests in
    a real browser; `make test-browser` passes, which builds `bin/sdash` and
    runs the Playwright tests with the axe scan against it; and the
    `verify-ui` skill has been followed, its screenshots read.
11. Documentation and decision records are in the same PR: a decision adds a
    record under `doc/adr/` and a line to `doc/adr/README.md`; a change of
    behaviour updates the doc comments, `README.md`, `AGENTS.md` and the
    document in `doc/` that describes it.
12. Re-read the diff: both SPDX lines on new files, or an annotation in
    `REUSE.toml` for a file that cannot hold a comment; doc comments on
    exported identifiers; tests for new behaviour; no data_parser version or
    Slurm release outside `internal/slurm/versions` and
    `internal/slurm/releases`; and Conventional Commit messages with bullet
    bodies on every commit, since a rebase-merge puts each one on `main` as
    it is.

## Updating the branch

- Rebase onto `main`, never merge `main` into the branch:
  `git fetch origin main && git rebase origin/main`, resolve conflicts, rerun
  the checks above, then `git push --force-with-lease`.

## The pull request

- There is no template. A PR with one topic takes a Conventional Commit
  subject as its title. The body has the sections Summary, Commits, Checks
  and Left for the maintainer.

## CI (`.github/workflows/ci.yml`)

| Job | Runs |
|-----|------|
| Test (Go floor, ubuntu-latest), Test (Go current, ubuntu-latest), Test (Go current, macos-latest) | `go vet` and `go test -race` with the newest patch of the release line in `go.mod`, and of the one in `mise.toml` on Linux and on macOS; the Linux leg of the latter runs `make cover` and keeps the profile |
| Fuzz targets, Fuzz (`<package>`, `<target>`) | `make fuzz` with one target for 60 s, a leg for each entry of the `FUZZ` list in the `Makefile`; skipped while the list is empty. A failing input is uploaded as an artifact, to be committed under the package's `testdata/fuzz/` |
| Lint | `make tidy` leaves `go.mod` and `go.sum` unchanged, golangci-lint at the version `mise.toml` names |
| UI | `make lint-ui`, the type check, `make test-ui` and, in Chromium, `make test-components` |
| Browser (chromium), Browser (firefox), Browser (webkit) | the Playwright tests with the axe scan against the built binary, one engine each |
| Generated | `make generate` leaves the tree unchanged |
| Markdown | `make lint-docs` |
| REUSE | `reuse lint` |
| Vulnerabilities | govulncheck on the current line |
| Build | `make build`, the smoke test of `bin/sdash`, and a rehearsal of the release with GoReleaser that publishes nothing, the licence listing of `make notices` included |
| Cross build (linux), Cross build (darwin) | the release targets of one operating system, on amd64 and arm64 |
| Release tag verification | `make test-release`: the tag verification script against scratch tags |

- Every failure is this PR's to root-cause and fix. Never skip or disable a
  test.
- Vulnerabilities fails for a new advisory against the standard library
  without any change in the PR. Say so on the PR; the fix is a Go patch
  release, which the job picks up when it is out.
- There is no end-to-end job yet. It arrives with slurmrestd support in sind
  (`doc/adr/0016-e2e-and-fixtures-on-sind.md`), as one leg per supported
  Slurm release.

## GitHub etiquette

- Ask the maintainer before posting any comment or review reply, and never
  @-mention anyone.
- Never merge PRs, push to `main`, or create tags or releases.
