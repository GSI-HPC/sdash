<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Adapted from GSI-HPC/clusterctl doc/testing.md. -->

# Testing

How tests are written here is decided in
[0015](adr/0015-how-tests-are-written.md). This document says what each
layer of tests is for and how it is run.

| Layer | What it is for | Run it with |
| --- | --- | --- |
| Go tests | The logic of the binary: the command line, the listener and its checks, the API handlers | `make test` |
| Fuzz targets | What must hold for any input | `make fuzz` |
| Frontend unit tests | Logic that needs no page | `make test-ui` |
| Component tests | One component in a real browser | `make test-components` |
| Browser tests | The built binary in a browser, with the accessibility scan of every view | `make test-browser` |
| Smoke test | A built binary starts, signs a client in and serves its page and its API | `.github/scripts/smoke-test.sh bin/sdash` |
| Release tag verification | The check that refuses a release tag | `make test-release` |
| End to end against Slurm | Nothing yet; see [below](#end-to-end-against-slurm) | |

CI (`.github/workflows/ci.yml`) runs each of them on every pull request.
The Go tests run there on both Go release lines, the `go` line of `go.mod`
and the line `mise.toml` names, and on macOS as well; `make floor` runs them
locally with the `go.mod` line.

## Writing a Go test

- Table-driven, with the case name saying what property is being checked
  rather than which function is being called. The same holds for the name
  of a test.
- A test that needs a reason has a comment giving it. If a test exists
  because a specific thing went wrong, that is worth recording next to the
  assertion.
- `t.Parallel()` is the first line of every test, so the code under test
  has no package-level state. A test that cannot run in parallel, because
  it changes the working directory, say, has a comment that says why.
- Fakes, not mocks. A fake behaves like the thing it stands for, an
  `httptest` server or a function the code is handed in place of the real
  one, and the test asserts on what came out. It does not assert on which
  calls the implementation happened to make.
- Where time matters, the test runs in a `testing/synctest` bubble, whose
  clock passes at once. Nothing sleeps.
- Assertions are testify's: `require` for a check the test cannot continue
  without, `assert` otherwise.
- A test fails, and does not skip, when a tool it needs is missing: a suite
  that passes by running nothing would be read as a green one.
- Code that only tests need and several packages share lives in a package
  named `xxxtest`, beside the package it supports.

The Go tests need neither Node nor a built UI. Without one the binary embeds
a placeholder, and the tests of the server bring their own files.

## Coverage

Coverage is reported per package and is not a target in itself. `make cover`
prints the total, and CI keeps the profile of every run as the artifact
`coverage` for 14 days. Nothing fails on a number.

Two rules keep the number meaningful:

- Every package with code written here has at least one test file, which
  is also what keeps `go test -cover ./...` working across the module.
  `internal/api` holds generated code only and is tested through
  `internal/server`, which implements its interface.
- A test asserts on behaviour that would be wrong if it changed, not on the
  shape of an implementation.

## Fuzzing

A fuzz target checks what must hold whatever the input: that a parser never
panics, that what it accepts it also prints back. The targets are the `FUZZ`
list in the `Makefile`, written as `package:Target`. `make fuzz` runs each
for `FUZZTIME`, 60 s unless told otherwise, and `FUZZ=internal/x:FuzzY` runs
one.

CI reads the same list and runs each target for a minute on every change.
When one fails, CI uploads the failing input; it is committed under the
package's `testdata/fuzz/`, where every later `go test` replays it.

The list is empty today. The first targets will be the parsers of what
slurmrestd sends, and they wait with everything else that speaks to Slurm.

## The frontend's three layers

The frontend has three kinds of test, and the name of a file decides which
one it is.

**Unit tests** are `*.test.ts` and `*.test.tsx` files under `web/src`. Vitest
runs them in Node, without a page. They are for logic: what the client makes
of an answer, how the theme is chosen, whether the design tokens keep their
contrast. A test hands the code a function in place of `fetch`; nothing
talks to a server. `make test-ui`, or `npm test` in `web/`.

**Component tests** are `*.browser.test.tsx` files. Vitest's browser mode
renders one component in Chromium and the test uses it as a person would:
by its role and its name, with clicks and keys. They are for what a
component does in a real browser, which a simulated page in Node gets wrong
often enough: focus, the keyboard, what is announced. Only Chromium runs
them; the engines are compared one layer up. `make test-components`, or
`npm run test:components` in `web/`.

**Browser tests** are the Playwright tests in `web/e2e`. They run against the
built binary, not against the development server, because only the binary
serves the embedded build under its Content-Security-Policy, which is what a
user gets. They are for whole flows, for what holds only when server and UI
meet, and for the accessibility scan. They run in Chromium, Firefox and
WebKit, the engines behind the supported browsers
([0014](adr/0014-accessibility-and-browsers.md)). `make test-browser` builds
`bin/sdash` and runs them; the tests start the binary themselves on a free
port and stop it again. `npm run test:browser -- --project=chromium` in
`web/` runs one engine.

The two layers that need a browser use the builds Playwright installs:
`npx playwright install` in `web/`. Where that is not wanted, `SDASH_CHROMIUM`
names a Chromium on the machine, which covers the component tests and the
Chromium leg of the browser tests. With `SDASH_URL` set to the address a
running sdash printed, the browser tests use that sdash and start none.

## The accessibility scan

The target is WCAG 2.1, level AA
([0014](adr/0014-accessibility-and-browsers.md)). Every view has a browser
test that scans it with axe and expects no violation: in the light and in
the dark theme, since contrast differs between them, and in each state that
has colours of its own, such as a failure. `scan()` in `web/e2e/support.ts`
is the one place the scan is configured. It runs every rule axe enables by
default, on the whole page, so an exception would have to be made there,
where it is seen and has to give its reason.

A scan finds only what a tool can see. Keyboard operation, the order of the
focus and what a screen reader says are checked by a person, view by view;
the `verify-ui` skill in `.agents/skills/` says how.

## The binary as a whole

`.github/scripts/smoke-test.sh` starts a built binary on a free port, checks
that it refuses a client that has not signed in, signs in through the
address the binary printed, fetches the page and the script the page names,
asks the API for the status, and stops the binary with SIGTERM, which has to
end it with exit 0. A binary compiled without the UI fails it. CI runs it on
`bin/sdash` and on the binary of a rehearsed release archive, and the
release build runs it before anything is published
([release.md](release.md)).

`make test-release` tests the script that verifies a release tag, against
tags it signs in a scratch repository: one case for each way a tag has been
shown to pass that should not.

## End to end against Slurm

There is no test against a real Slurm yet, and no test fixture. Both come
from clusters that [sind](https://github.com/GSI-HPC/sind) creates
([0016](adr/0016-e2e-and-fixtures-on-sind.md)), and sind does not run a
slurmrestd yet; [sind-requirements.md](sind-requirements.md) says what sdash
needs from it. Until then nothing Slurm-facing is written, no fixture is
taken from anywhere else, and `doc/design/sdash-data.js` is not the truth
about the API.

When sind is ready, the suite follows clusterctl's: a package `e2e/` behind
the build tag `e2e`, so that `go test ./...` never needs Docker, which runs
the built binary against the cluster of `e2e/testdata/`; `make e2e-up`,
`make e2e` and `make e2e-down`; and a CI job with
[sind-action](https://github.com/GSI-HPC/sind-action) for each supported
Slurm release. The suite will fail, rather than skip, when sind or the
cluster is missing. The fixtures of the other layers and the vendored
slurmrestd specs are captured from those runs.
