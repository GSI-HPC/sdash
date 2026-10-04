---
name: add-slurm-release
description: Add a Slurm release to the ones sdash supports, or drop one. Covers the data_parser registry entry, the parser directory with its vendored spec, the release file with status mapping and known bugs, the fixtures, the capabilities and the support matrix, the CI matrix, the README and the decision record. Use when a new Slurm release is out and sind publishes a node image for it, when an issue asks for a release to be added or dropped, or when the maintainer says a release has left support.
---

<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Add or drop a Slurm release

**This skill cannot be carried out yet.** Every vendored spec and every
fixture comes from an end-to-end run on a cluster that GSI-HPC/sind created
(`doc/adr/0016-e2e-and-fixtures-on-sind.md`), and sind starts no slurmrestd
yet (sind issue 90). Until sind does and sdash has its end-to-end suite,
`internal/slurm/` and `e2e/` do not exist, and the paths below are the layout
that `doc/adr/0005-versions-releases-and-capabilities.md` and section 5 of
`doc/initial-conclusions.md` plan; `doc/sind-requirements.md` says what sind
has to provide first. If asked to add a release before then, stop and say
so. If the tree has turned out differently by the time the first release is
added, correct this skill in the same PR.

sdash knows a release under two independent keys, and each key has one place:

| Key | Where | What it holds |
|-----|-------|---------------|
| data_parser version (`v0.0.NN`), which decides the JSON schema | `internal/slurm/versions/registry.go` and `internal/slurm/versions/v00NN/` | the supported parser versions in order; for each one the vendored `openapi.json`, `profile.go` (paths, field and enum fix-ups) and `testdata/` (captured responses in this schema) |
| Slurm release (`YY.MM`), which decides behaviour | `internal/slurm/releases/rYYMM.go` and `internal/slurm/releases/testdata/` | the status mapping, the known bugs with the maintenance release that fixes each, and the captured error cases |

Each Slurm release ships four data_parser versions, and the newest of them is
new in that release (`doc/research/slurmrestd.md`, section 1): v0.0.44 came
with 25.11, v0.0.45 with 26.05. Adding a release therefore adds one parser
directory and one release file, and dropping one deletes them.

Nothing outside those two directories mentions a parser version or a Slurm
release, so a new release needs no change to a handler, a service or the UI.
If it seems to need one, a capability is missing: add the capability, never
a version comparison.

## Adding a release

1. **Check the precondition.** sind publishes a node image for the release
   line, `ghcr.io/gsi-hpc/sind-node:<YY.MM>`, with slurmrestd in it, and the
   sind version that `mise.toml` pins can create a cluster from it. If either
   is missing, stop and tell the maintainer. Never take a spec or a response
   from anywhere else: not from SchedMD's documentation, not from a
   production cluster, not from `doc/design/sdash-data.js`.
2. **Registry.** Add the release's new data_parser version to
   `internal/slurm/versions/registry.go`, in its place in the order.
3. **Parser directory.** Create `internal/slurm/versions/v00NN/`. Its
   `openapi.json` is the document captured from the slurmrestd of a sind
   cluster on the new release, by the end-to-end run of step 5. `profile.go`
   holds the paths and the field and enum fix-ups: compare the new spec with
   the previous parser's. A property whose type changed needs a decoder, a
   changed enum vocabulary needs a fix-up, and a request body never carries a
   field or an enum value the parser lacks. Then run the conformance test:
   each JSON path and enum value the wire structs read or write must exist in
   the new spec with a compatible type, or be listed as absent for this
   parser. The spec is SchedMD's work, not GSI's, so check that `REUSE.toml`
   covers the new file under the block that names the upstream holder.
4. **Release file.** Create `internal/slurm/releases/rYYMM.go` with the
   status mapping of the release (which HTTP status and Slurm `error_number`
   a rejected request, a missing credential and an expired token produce)
   and its known bugs, each with the maintenance release that fixes it.
5. **Fixtures.** Bring up the cluster of `e2e/testdata/` on the new node
   image and run the suite: `make e2e-up`, `make e2e`, `make e2e-down`. The
   captured responses go to `internal/slurm/versions/v00NN/testdata/`, the
   error cases to `internal/slurm/releases/testdata/`. Never write or edit a
   fixture by hand. `make test` then runs the decode and mapping tests over
   the captured responses of every version.
6. **Capabilities and the support matrix.** In `internal/slurm/capability/`,
   add the capabilities the release brings and adjust the requirements that
   change with it: bound operations, schema elements of the parser, a
   minimum release for behaviour the spec cannot show. The conformance test
   also checks each capability's requirements against every vendored spec
   and regenerates the support matrix, capability by release. Commit the
   regenerated matrix; it is documentation.
7. **CI matrix.** Add the release line to the matrix of the end-to-end job
   in `.github/workflows/ci.yml`.
8. **README and the decision record.** Bring "Supported Slurm releases" in
   `README.md` up to date. `doc/adr/0004-slurm-25-11-is-the-floor.md` names
   the floor and the rule for dropping a release; a release above the floor
   leaves it as it is.
9. **Check.** The checks of the `steward` skill, and `make e2e` against
   every supported release.
10. **Commit.** `feat(versions): support slurm YY.MM`, with bullets for the
    parser version and where its spec was captured (sind version, image tag,
    exact Slurm version), the release file, the capabilities added or
    changed, and the CI and README lines, plus `Closes #N` if there is an
    issue.
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
   `internal/slurm/capability/`, and regenerate and commit the support
   matrix.
3. Delete `internal/slurm/releases/rYYMM.go` and its error cases under
   `internal/slurm/releases/testdata/`.
4. Delete the parser directory that came with the release,
   `internal/slurm/versions/v00NN/`, and its entry in `registry.go`.
5. Bring "Supported Slurm releases" in `README.md` up to date. When the
   dropped release was the floor, write a new decision record that
   supersedes `doc/adr/0004-slurm-25-11-is-the-floor.md` and add it to
   `doc/adr/README.md`; of the old record only the status line changes.
6. Run the `steward` checks and `make e2e` against the releases that remain.
7. Commit as `feat(versions)!: drop slurm YY.MM`. The body says when
   SchedMD's support ended and that no own cluster runs the release.
