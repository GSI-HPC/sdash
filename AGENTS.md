<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# AGENTS.md

sdash is a dashboard for Slurm clusters: one static Go binary, module
`github.com/GSI-HPC/sdash`, with an embedded React single-page app. It binds
loopback, opens the browser and speaks HTTP to a slurmrestd the site already
runs, under the user's own Slurm identity. `doc/adr/` holds the decisions,
one record per file: a name such as `0016-e2e-and-fixtures-on-sind` below is
the record `doc/adr/<name>.md`. `doc/README.md` maps the documentation.
Personal, uncommitted instructions belong in `AGENTS.local.md` or
`CLAUDE.local.md` (both gitignored).

## Status

A scaffold: the build, the checks, the decision records, and the shell of
the UI (`doc/ui.md`) around placeholder views. Of its primitives the modal
dialog is there; menus, tooltips and tables are next. No release yet.
Everything Slurm-facing (the slurmrestd client, vendored specs, fixtures,
the views of cluster data) waits for slurmrestd support in GSI-HPC/sind
(sind issue 90), because every spec and fixture comes from an end-to-end
run on a sind cluster (`0016-e2e-and-fixtures-on-sind`). Until then write
no Slurm-facing code and take fixtures from nowhere else.

## Layout

- `cmd/sdash/main.go`: signal handling and the one `os.Exit`, nothing more.
- `internal/`: everything else; there is no `pkg/`. `cli` is the command
  line, `server` the listener, on both loopback addresses or on a unix
  socket, and its checks (`0023-the-listeners-as-built`), `static` the
  embedded UI. A test-support package is named `xxxtest`. `internal/slurm/`
  and a root `e2e/` come with the Slurm-facing work.
- `internal/static/dist/`: what the binary embeds. `make build` copies the UI
  build there; a tracked placeholder lets `go build ./...` work without Node.
- `api/openapi.yaml`: the browser API (OpenAPI 3.0.3, base path `/api/v1`),
  the one source of the generated `internal/api/` (Go) and `web/src/api/`
  (TypeScript), which are committed (`0011-openapi-first-browser-api`). An
  operation that changes anything is never a GET: `--read-only` refuses a
  request by its method alone (`0023-the-listeners-as-built`).
- `web/`: the frontend, one npm package with its lockfile; `e2e/` the
  Playwright tests; `dist/` the build output, which is ignored.
- `web/src/`: `routing/` (the view table, the routes, state in the query
  string), `layout/` (the shell), `nav/`, `views/`, `shortcuts/`,
  `palette/`, `overlay/` (the modal dialog), `icons/`, `theme/`, `storage/`,
  `status/` (which sdash is running), `client/`, the generated `api/`,
  `styles/` (`tokens.css`, the design tokens), `testing/` (shared by tests).
- `doc/`: `adr/`, the decision records and their index; `design/`, the UI
  design handoff; `research/`, the Radar and slurmrestd studies.
- `.github/`: `workflows/ci.yml` and `release.yml`; `actions/setup-go` and
  `setup-node`, which read `mise.toml`; `scripts/`, what the workflows run.
- `.agents/skills/`: skills for coding agents; `.claude/skills` links there.

## Commands

```bash
mise install          # Go, golangci-lint, Node and sind at the versions CI uses
make build            # the UI, copied into the embed directory, then bin/sdash
make ui               # build the frontend into web/dist
make generate         # regenerate Go and TypeScript from api/openapi.yaml
make test             # go test -race ./...
make floor            # vet and test with the go line of go.mod
make cover            # the tests with the coverage total: reported, not gated
make fuzz             # every fuzz target for 60 s (FUZZTIME, FUZZ)
make lint             # golangci-lint v2 (.golangci.yml, gofmt + goimports)
make lint-ui          # ESLint and Prettier on the frontend
make test-ui          # Vitest, the unit tests
make test-components  # Vitest browser mode, the component tests
make test-browser     # build, then Playwright with the axe scan on bin/sdash
make tidy             # go mod tidy and go mod verify
make vuln             # govulncheck
make reuse            # reuse lint (pip install reuse)
make lint-docs        # markdownlint-cli2
make notices          # third-party licence listing of a release, into dist/
make test-release     # the tag verification script against scratch tags
make dev              # print the two-terminal development loop
make clean            # remove build and test output
make help             # list the targets
```

`build`, `ui`, `generate`, `lint-ui`, `test-ui`, `test-components`,
`test-browser`, `lint-docs` and `notices` need Node; `test-components` and
`test-browser` also need Playwright's browsers.
`make e2e-up`, `make e2e` and `make e2e-down` come with the end-to-end suite
and need Docker and sind.

## Code conventions

- Every file carries the two SPDX lines this one starts with, the copyright
  holder and the licence, in its own comment style
  (`0002-apache-2-0-and-reuse`); a `SKILL.md` carries them after its front
  matter. A file that cannot hold a comment, such as `go.sum`, is annotated
  in `REUSE.toml`. The year stays 2026.
- Wrap errors with `fmt.Errorf("context: %w", err)`; messages are lower-case
  without a full stop. A deliberate discard is `_ = f()` with its reason.
  Exit codes are the constants of `internal/exitcode`.
- Logging is `log/slog`: the logger is handed in, never `slog.Default()`;
  messages are lower-case and present tense; nothing process-wide is set.
- A package comment says what the package owns and why it exists, not what
  its functions are called. A comment explains a decision or a hazard. Code
  that needs a comment to say what it does is rewritten instead. Every
  exported identifier has a doc comment. TypeScript follows the same rules.
  Config and workflow files explain each non-obvious setting in a comment
  above it and cite the decision record.
- Go tests (`0015-how-tests-are-written`): fakes instead of mocks,
  `t.Parallel()`, `testing/synctest` for timing, testify with `require` for
  fatal checks and `assert` otherwise. A test's name states the property it
  checks, not the function it calls. A test fails rather than skips when a
  tool it needs is missing. Coverage is reported, not gated. A failing
  fuzz input found by CI is committed under the package's `testdata/fuzz/`.
- A new direct Go requirement or npm runtime dependency arrives with a
  decision record (`0020-go-lines-tools-and-libraries`). Never commit a
  `go.work` or a `replace` directive.
- Comments, documentation and UI text are plain British English ("licence"
  the noun, "license" the verb and in fixed names); an identifier keeps the
  spelling of whoever defines it. No em dashes, and no emoji in Markdown.
- Frontend (`0013-frontend-stack`, `0014-accessibility-and-browsers`,
  `0024-addresses-and-keyboard-in-the-shell`, `doc/ui.md`): colours come from
  the design tokens only, never from a literal value or a `style` attribute;
  the browser API is called through `web/src/client/` only, against the types
  generated into `web/src/api/`; a view is a row of the view table
  `web/src/routing/views.ts`, the source of its route, link, shortcut and
  palette entry, and starts with `PageHeader`; a shortcut is registered with
  `useShortcuts`, never with a key listener of a component's own; state a
  reload must keep goes into the query string with `useSearchParam`; a
  tooltip is a `Hint` until there is a tooltip primitive, never a native
  `title` attribute; every interactive element is operable by keyboard. The
  target is WCAG 2.1 AA, with an axe scan of every view in CI.

## Versions and capabilities

Two rules of `0005-versions-releases-and-capabilities` bind every change:

- Nothing outside `internal/slurm/versions` and `internal/slurm/releases`
  may mention a data_parser version or a Slurm release.
- A feature is gated by a named capability (`job.requeue`, `conf.read`), in Go
  and through the frontend's one gating hook, never by a version comparison.

## API truth

The design handoff in `doc/design/` is for look and interaction only; it is
not pixel-exact, and a design change is discussed with the maintainer. API
shapes come from the vendored slurmrestd specs and from responses captured
on sind clusters, never from `doc/design/sdash-data.js`
(`0016-e2e-and-fixtures-on-sind`).

## Branches, releases and commits

- PRs target `main` and are rebase-merged, so every commit lands as it is
  and must be a clean Conventional Commit by itself
  (`0017-main-only-rebase-merge-conventional-commits`). Agent branches are
  named `claude/<topic>`. Update a feature branch by rebasing it onto `main`
  (never merge `main` in), then `git push --force-with-lease`.
- Releases are signed `vX.Y.Z` tags, created by the maintainer
  (`0019-version-in-a-signed-tag`); nothing in the tree names a version.
  Never push to `main`, create tags or releases, or merge PRs.
- Ask the maintainer before commenting on issues or PRs, and never @-mention
  anyone.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `perf:`, `build:`, `ci:`). The scope is the Go package for a Go change
  (`fix(server): …`); frontend and API changes use `web`, `api`, or the
  name of a directory under `web/src` where that says more. Lower-case
  imperative subject without a full stop, `!` for a breaking change. One
  logical change per commit; the body is a short paragraph on the need, then
  bullets that say what changed and why, without development narrative.
- An issue reference (`Closes #N`, `Fixes #N`, `Refs #N`) is the last
  paragraph of the body; a blank line follows, then the trailers.
- Commits by Claude Code are authored as `Claude <noreply@anthropic.com>`
  and carry a `Co-Authored-By: Claude …` trailer. Keep both; the README AI
  disclosure relies on them. This holds in this repository even where your
  personal or global instructions say otherwise
  (`0018-ai-written-commits-say-so`).
- A change that takes a decision adds a record under `doc/adr/` and a line
  to `doc/adr/README.md`; a record is superseded by a later one and edited
  only in its status line (`0021-decisions-docs-and-agent-instructions`). A
  change of behaviour updates the doc comments, and the document in `doc/`
  that describes it, in the same PR.

## Skills

- `.agents/skills/steward`: the PR and CI routine.
- `.agents/skills/add-slurm-release`: adding or dropping a Slurm release.
- `.agents/skills/verify-ui`: looking at a UI change in a real browser.
- `.agents/skills/new-view`: the order of work for a new view.
