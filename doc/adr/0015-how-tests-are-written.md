<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0015: How tests are written

Status: accepted

## Context

The sibling repositories test in two ways. sind uses testify and gates its
coverage. clusterctl, go-clikit and go-nodeset use the standard library
alone, name a test after the property it checks and run every test in
parallel; the two libraries gate at 100% coverage and refuse testify in
their linter, clusterctl reports coverage and gates nothing. sdash also has
a frontend, which none of them has.

## Decision

Go, in clusterctl's style, with testify:

- Fakes instead of mocks. A test asserts on behaviour, not on the calls an
  implementation happens to make.
- `t.Parallel()` in every test, and `testing/synctest` where time matters.
- A test's name states the property it checks, not the function it calls.
- Native fuzz targets, run in CI.
- testify for assertions: `require` for a check the test cannot continue
  without, `assert` otherwise.
- Coverage is reported, not gated.
- A test fails, and does not skip, when a tool it needs is missing.
- Test-support code lives in packages named `xxxtest`.

Frontend:

- Vitest for unit tests, and Vitest's browser mode for components.
- Playwright for end-to-end flows against the built binary, with the axe
  scan of [0014](0014-accessibility-and-browsers.md).
- ESLint with typescript-eslint, and Prettier.

[testing.md](../testing.md) says how each layer is run. The tests against a
real Slurm are [0016](0016-e2e-and-fixtures-on-sind.md).

## Why

- A suite that passes by running nothing is read as a green one. Failing on
  a missing tool keeps a changed runner from turning a job green.
- Coverage is reported for each package and is not a target in itself.
- Parallel tests need code without package-level state, which sdash wants
  anyway: several clusters live in one process.

## Costs

- testify is a requirement that the three newer siblings refuse
  ([0020](0020-go-lines-tools-and-libraries.md)). A test moved in from them
  is converted, or stands out.
- Without a gate, a drop in coverage is noticed only by someone who reads
  the report.
- A contributor who lacks a tool gets a red test, not a skipped one.
- The frontend has three test layers with three configurations, and the
  Playwright layer needs browsers installed and a built binary.
