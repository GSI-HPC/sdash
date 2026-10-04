<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0020: Go lines, pinned tools and the libraries sdash starts with

Status: accepted

## Context

The four sibling repositories settled how a Go project of GSI is laid out,
built and linted, each a little differently, and sdash takes the newest
practice of each kind. Two points had to be decided for sdash itself: the
first architecture position names the standard library's `flag`, where both
sibling applications use cobra, and sdash is a server, where the siblings
are command-line tools.

## Decision

- **Go lines.** `go.mod` says `go 1.26.0`: the floor, a `.0` release, with
  no `toolchain` line. `mise.toml` names the build line, `go = "1.27"`, and
  CI and the release build use its newest patch. `make floor` and one CI
  leg test the floor.
- **Tools.** `mise.toml` also pins golangci-lint exactly (2.14.0, which CI
  reads from there), Node (the 24 line) and sind for Linux.
  `/mise.local.toml` is ignored.
- **Lint.** golangci-lint v2 with the linters of go-clikit and go-nodeset
  and `bodyclose`; `e2e` among the build tags; misspell lets Slurm's
  `organization` pass; gofmt and goimports as formatters. depguard, the
  thirteenth of theirs, is left out until sdash has rules for it.
- **Requirements the module starts with:** `github.com/spf13/cobra`, with
  pflag, for the command line, as sind and clusterctl and in place of the
  `flag` the first position names; `github.com/go-chi/chi/v5` for the router,
  as Radar; and `github.com/stretchr/testify` for tests
  ([0015](0015-how-tests-are-written.md)). The generated server
  ([0011](0011-openapi-first-browser-api.md)) is written for chi and needs
  no module of its own.
- **Dependency policy.** A new direct Go requirement, or a new npm runtime
  dependency, arrives with a decision record. CI checks that `go mod tidy`
  changes nothing. There is no `replace` and no committed `go.work`.
- **Logging** is the standard library's `log/slog`. The logger is handed
  in, never `slog.Default()`; messages are lower-case and in the present
  tense; nothing process-wide is set.
- **Errors** are wrapped with `fmt.Errorf("context: %w", err)`, lower-case
  and without a full stop. A deliberate discard is `_ = f()` with its
  reason.
- **Exit codes** are named constants in one package: 0 for success, which
  includes a clean shutdown on SIGINT or SIGTERM, 1 for a failure, 2 for a
  usage or configuration error.
- **Layout.** `cmd/sdash/main.go` holds signal handling and the one
  `os.Exit`. Everything else is under `internal/`; there is no `pkg/`, and
  `e2e/` at the root comes with [0016](0016-e2e-and-fixtures-on-sind.md).
  The module path is `github.com/GSI-HPC/sdash`.

## Why

- A binary is only as patched as the toolchain that linked it, so releases
  use the newest patch of the newest line, while the floor stays a release
  the Go project still supports.
- An exact linter version keeps a new linter release from failing a change
  that did not cause it, and gives `make lint` and CI the same linter.
- cobra gives the people who run sind and clusterctl the flag syntax, the
  `version` subcommand and the shell completion they know.
- A signal is the normal way to stop a server, so it ends with 0 where the
  siblings end with 130.

## Costs

- Both Go lines and the linter pin are raised by hand; Dependabot moves
  none of them.
- cobra, with what it requires, and chi are modules to keep current where
  the standard library's `flag` and `net/http` would have needed none.
- A library that would save a day still waits for its record.
- sdash differs from each sibling somewhere, so a file copied from one of
  them is read before it is trusted.
