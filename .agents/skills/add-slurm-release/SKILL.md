---
name: add-slurm-release
description: Add a Slurm release to the ones sdash supports, or drop one. Covers the data_parser registry entry, the parser directory with its vendored spec, the release file with status mapping and known bugs, the fixtures, the capabilities and the support matrix, the CI matrix, the README and the decision record. Use when a new Slurm release is out and sind publishes a node image for it, when an issue asks for a release to be added or dropped, or when the maintainer says a release has left support.
---

<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Add or drop a Slurm release

Every vendored spec and every fixture comes from an end-to-end run on a
cluster that GSI-HPC/sind created (`doc/adr/0016-e2e-and-fixtures-on-sind.md`),
and sind starts a slurmrestd on the 26.05 images only
(`doc/adr/0031-slurmrestd-end-to-end-on-26-05.md`). A release whose sind
image runs no slurmrestd, 25.11 today, cannot be added: stop and say so.
`doc/sind-requirements.md` says what sind has to provide. The tree is the
one of `doc/adr/0032-the-slurm-client-as-built.md`; if it has changed since,
correct this skill in the same PR.

sdash knows a release under two independent keys, and each key has one place:

| Key | Where | What it holds |
|-----|-------|---------------|
| data_parser version (`v0.0.NN`), which decides the JSON schema | `internal/slurm/versions/registry.go` and `internal/slurm/versions/v00NN/` | the parsers sdash speaks, oldest first, in `known`; for each one the vendored `openapi.json` and `testdata/` (captured answers in this schema) |
| Slurm release (`YY.MM`), which decides behaviour | `internal/slurm/releases/rYYMM.go` and `internal/slurm/releases/testdata/rYYMM/` | the profile of the line: its first release and the kind of failure each HTTP status stands for; the captured error cases with their status in `status.tsv` |

Each Slurm release ships four data_parser versions, and the newest of them is
new in that release (`doc/research/slurmrestd.md`, section 1): v0.0.44 came
with 25.11, v0.0.45 with 26.05. Adding a release therefore adds one parser
directory and one release file, and dropping one deletes them.

Nothing outside those two directories mentions a parser version or a Slurm
release, and `TestNoVersionIsNamedOutsideTheVersionPackages` fails when Go
code does, so a new release needs no change to a handler, a service or the
UI. If it seems to need one, a capability is missing: add the capability,
never a version comparison.

## Adding a release

1. **Check the precondition.** sind publishes a node image for the release
   line, `ghcr.io/gsi-hpc/sind-node:<YY.MM>`, with slurmrestd in it, and the
   sind version that `mise.toml` pins can create a cluster from it. If either
   is missing, stop and tell the maintainer. Never take a spec or a response
   from anywhere else: not from SchedMD's documentation, not from a
   production cluster, not from `doc/design/sdash-data.js`.
2. **CI matrix.** Add the release line to the matrix of the end-to-end job
   in `.github/workflows/ci.yml`. The job seeds the cluster, captures what
   slurmrestd sends with `e2e/capture.sh`, and keeps the capture as the
   artifact `capture-slurm-<YY.MM>`.
3. **Fixtures.** Download that artifact of a green run into `e2e/capture/`
   and run `make e2e-vendor VERSIONS=v0.0.NN`. `e2e/vendor.sh` writes the
   parser's document and answers to `internal/slurm/versions/v00NN/`, the
   error cases and `status.tsv` to `internal/slurm/releases/testdata/rYYMM/`,
   and normalises every answer with `e2e/normalise.jq` on the way. Never
   write or edit a fixture by hand. Commit the result by itself. The spec is
   SchedMD's work, not GSI's, so check that `REUSE.toml` covers the new file
   under the block that names the upstream holder.
4. **Registry.** Add the new data_parser version to `known` in
   `internal/slurm/versions/registry.go`, in its place in the order.
5. **Wire structs.** `make test` runs the conformance test of
   `internal/slurm/wire` against the new document: each field the structs
   read must exist with a type that fits. Compare the new spec with the
   previous parser's. A property whose type changed needs a decoder of its
   own in `wire`, a changed enum vocabulary needs a fix-up, and a request
   body never carries a field or an enum value the parser lacks. The decode
   tests of `wire` and the tests of `client` then run over the new captures.
6. **Release file.** Create `internal/slurm/releases/rYYMM.go` with the
   profile of the line (`First`, and `Status` for each HTTP status that
   means something other than HTTP says in general), and add it to
   `profiles` in `releases.go`. Read the statuses from `status.tsv`, not from
   the documentation. `TestEveryCapturedErrorCaseIsClassified` in
   `internal/slurm/client` fails for a captured case it has no expectation
   for; add the expectation, and a Slurm error number that says more than a
   status to `internal/slurm/errs`.
7. **Capabilities and the support matrix.** Once `internal/slurm/capability/`
   exists: add the capabilities the release brings and adjust the
   requirements that change with it (bound operations, schema elements of
   the parser, a minimum release for behaviour the spec cannot show), and
   commit the regenerated support matrix, capability by release. Until then
   there is nothing to do here.
8. **README and the decision record.** Bring "Supported Slurm releases" in
   `README.md` up to date. `doc/adr/0004-slurm-25-11-is-the-floor.md` names
   the floor and the rule for dropping a release; a release above the floor
   leaves it as it is.
9. **Check.** The checks of the `steward` skill, and the end-to-end job
   against every supported release.
10. **Commit.** The vendored capture by itself (`test(slurm): vendor …`),
    then `feat(versions): support slurm YY.MM`, with bullets for the parser
    version and where its spec was captured (sind version, image tag, exact
    Slurm version from `provenance.txt`), the release file, the
    capabilities added or changed, and the CI and README lines, plus
    `Closes #N` if there is an issue.
11. **PR to `main`.** Link the release notes of the Slurm release. The
    end-to-end job runs the suite against every release line, the new one
    included; that is the real verification.

## Dropping a release

A release is dropped when SchedMD's support for it has ended **and** no own
cluster runs it (`doc/adr/0004-slurm-25-11-is-the-floor.md`). Only the
maintainer knows the second half, so never drop a release on your own
judgement: ask first, and quote the answer in the PR.

Then the steps above in reverse:

1. Remove the release line from the end-to-end matrix in
   `.github/workflows/ci.yml`.
2. Remove what only the dropped release needed from
   `internal/slurm/capability/`, once it exists, and regenerate and commit
   the support matrix.
3. Delete `internal/slurm/releases/rYYMM.go`, its entry in `profiles`, and
   its error cases under `internal/slurm/releases/testdata/rYYMM/`.
4. Delete the parser directory that came with the release,
   `internal/slurm/versions/v00NN/`, and its entry in `registry.go`.
5. Bring "Supported Slurm releases" in `README.md` up to date. When the
   dropped release was the floor, write a new decision record that
   supersedes `doc/adr/0004-slurm-25-11-is-the-floor.md` and add it to
   `doc/adr/README.md`; of the old record only the status line changes.
6. Run the `steward` checks and the end-to-end job against the releases
   that remain.
7. Commit as `feat(versions)!: drop slurm YY.MM`. The body says when
   SchedMD's support ended and that no own cluster runs the release.
