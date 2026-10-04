<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0019: The version lives only in a signed tag

Status: accepted

## Context

A release needs a version, a place for its notes, and a reason to trust the
binary. clusterctl, go-clikit and go-nodeset keep the version in a signed tag
alone and verify that tag before a release is built. sdash's binary reports
its version to the user and to slurmrestd ([0008](0008-user-agent.md)), and
it embeds third-party code whose licences ask to be shipped with it
([0002](0002-apache-2-0-and-reuse.md)).

## Decision

- Nothing in the tree names a version: no `VERSION` file, no constant, no
  `CHANGELOG.md`, and `CITATION.cff` has no `version`.
- Commits are not signed. A release is a signed annotated tag `vX.Y.Z`
  that the maintainer creates. The body of its message is the release notes.
- The release workflow runs a script that verifies the tag before anything
  is built. The model is clusterctl's; the script is go-nodeset's.
- The release build stamps the version into the binary. A build from a
  checkout reports `devel` and its revision.
- The first release is v0.1.0. Until 1.0.0 a minor release may make
  breaking changes and says so in its notes.
- Targets: Linux and macOS, each on amd64 and arm64. GoReleaser builds with
  `CGO_ENABLED=0` and `-trimpath` into `sdash_<os>_<arch>.tar.gz`, without a
  version in the name, with a `checksums.txt` and a build provenance
  attestation.
- Each archive carries a listing of the third-party licences of what the
  binary embeds: Go modules, npm packages and fonts. `make notices`
  generates it at the release build, and none of it is committed.

[release.md](../release.md) says how a release is cut and how the
verification is set up.

## Why

- A number in the tree is wrong on every commit between releases, and
  anyone with write access can change it. A signed tag is a statement by a
  person who holds a key, at one point in history.
- The notes are signed by the same key and in the same act as the version.
- An archive name without a version gives a stable download URL.

## Costs

- The signing key is part of the release, and the keys the workflow accepts
  are repository variables the maintainer keeps.
- Notes cannot be corrected without moving the tag, which the signature
  rules out.
- Only the tag is vouched for. Nothing proves who wrote a commit.
- A downloaded archive does not say which version it is until the binary is
  run.
- There is no Windows build, and `go install` gives a binary with the
  placeholder UI, so the archives are the only way to install.
- This record does not define what a breaking change is, across the command
  line, the profile file and the browser API.
