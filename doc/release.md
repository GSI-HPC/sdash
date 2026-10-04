<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Adapted from GSI-HPC/clusterctl doc/release.md and GSI-HPC/go-clikit doc/release.md. -->

# Releases

A release is a signed tag
([0019](adr/0019-version-in-a-signed-tag.md)). Only the maintainer creates
tags. This document says where the version of a binary comes from, how a
release is cut and what the workflow does with it, how a download is
verified, and what the maintainer sets up once before the first release.

## No version in the source tree

Nothing in this repository says what version it is. There is no `VERSION`
file, no constant, no `CHANGELOG.md` and no commit that bumps a number, and
`CITATION.cff` has no `version`.

A version exists only in two places: a **signed git tag**, and the GitHub
release built from it. A version in the tree is a claim anyone can edit and
that is wrong on every commit between releases, whereas a signed tag is a
statement by a person with a key.

`internal/version` therefore reports:

- the version the release build injected through `-ldflags`, when there was
  one;
- otherwise, for a build from a checkout, `devel` and what the Go toolchain
  stamped into the binary from the VCS: the revision, the commit time, and
  whether the tree was dirty. The toolchain also derives a version from the
  checkout, a pseudo-version or whichever tag the commit carries; that is
  ignored, because a local tag is not a signed release;
- otherwise the module version that `go install` built;
- otherwise `devel`.

```console
$ sdash version
v0.1.0 (a1b2c3d4e5f6) built 2026-10-03T17:23:00Z go1.27.1 linux/amd64
$ make build && bin/sdash version
devel (a1b2c3d4e5f6-dirty) built 2026-10-03T17:23:00Z go1.27.1 linux/amd64
```

The same version is in the `User-Agent` sdash names itself with
([0008](adr/0008-user-agent.md)) and in the answer to `GET /api/v1/status`.

`go install` is no way to install sdash. The UI is built by npm and is not
in the tree, so a binary built that way holds a placeholder and answers
every page by saying so. The release archives are the way.

## Cutting a release

1. Pick the commit on `main`, with CI green on it, and the version (see
   [Version numbers](#version-numbers)).
2. Write the message to a file. Its first line is the title; the rest is
   Markdown and opens the release notes:

   ```markdown
   sdash v0.2.0

   ## Changes

   - ...
   ```

3. Tag and push. git's default cleanup deletes every line that starts with
   `#`, Markdown headings included, so keep whitespace cleanup only:

   ```console
   $ git tag -s v0.2.0 --cleanup=whitespace -F notes.md <commit>
   $ git push origin v0.2.0
   ```

The tag must be signed with an SSH key listed in the
`RELEASE_ALLOWED_SIGNERS` repository variable, or with an OpenPGP key held
in `RELEASE_ALLOWED_PGP_KEYS`. Before it builds anything, the release
workflow refuses a tag that:

- is lightweight, or annotated but unsigned;
- carries a signature `git verify-tag` does not accept against those keys;
- was signed under another name than the one it was pushed as, such as a
  signed `v1.0.0` pushed again as `v9.9.9`;
- names another commit than the push;
- or when both variables are empty or not set, or `RELEASE_ALLOWED_PGP_KEYS`
  holds a private key or no public key.

`.github/scripts/verify-release-tag.sh` makes these checks, and CI tests it
against tags it makes on the spot (`make test-release`).

A pushed tag is never moved or deleted. A release that cannot be built from
its commit is followed by the next patch version, which is why CI rehearses
the release on every change: the Build job runs GoReleaser with the same
configuration and publishes nothing.

## What the workflow does

`.github/workflows/release.yml` runs when a `v*` tag is pushed:

1. It verifies the tag, as above.
2. It vets, tests and lints the commit the tag names, with the Go release
   line the binary is built with.
3. In a job of its own, `assets`, it makes what npm and third-party tools
   make of a release: `make build` builds the UI and copies it into the
   directory the binary embeds, `.github/scripts/smoke-test.sh` starts the
   binary and asks it for its page and its API, and `make notices` writes
   the listing of third-party licences. The UI and the listing are handed on
   as an artifact of the run.
4. In the `release` environment, it checks that the tag still points at the
   tag object that was verified, puts the UI and the listing in place, and
   runs GoReleaser (`.goreleaser.yaml`) for that tag, without its hooks and
   without the caches of earlier runs.
5. It attests the archives.

It publishes:

- `sdash_linux_amd64.tar.gz`, `sdash_linux_arm64.tar.gz`,
  `sdash_darwin_amd64.tar.gz` and `sdash_darwin_arm64.tar.gz`. Each holds
  the binary, statically linked with `CGO_ENABLED=0`, `README.md`,
  `LICENSE` and `THIRD-PARTY-NOTICES.txt`;
- `checksums.txt`, covering all four;
- a build provenance attestation for every archive;
- the release notes.

The archive name carries no version, so
`releases/latest/download/sdash_linux_amd64.tar.gz` is a stable address. The
version is in the tag, the release and the binary itself.

The binary is built with `-trimpath` and carries the version, the commit
and the commit's date, not the time or the place of the build.

The release job holds the only token that can write to the repository, and
it alone may ask for the certificate the attestation is signed with. The
other jobs run with a read-only token, and no job keeps the token in its
checkout.

What runs beside that token is kept small. GoReleaser hands a hook its whole
environment, so the frontend's toolchain, some 300 npm packages, and
go-licenses run in the `assets` job and not as hooks of the release job,
which runs the Go toolchain, GoReleaser and the attestation and no Node. The
release job also restores no Go cache: Go links what its build cache holds
without building it again, and that cache is saved by jobs on `main` that
run third-party code. The hooks stay in `.goreleaser.yaml` for CI's
rehearsal and for a snapshot built by hand, which publish nothing.

## Release notes

Anything the tag message says after its first line opens the release notes,
so the words that announce a release are signed with it. After them comes
the list of commits since the previous tag, grouped by type: features,
fixes, documentation, and the rest. Commits of the types `test` and `ci`
are left out. A tag made with `-m` has no body, and its notes are the commit
list alone.

The first release has no previous tag and lists no commits: its notes are
the tag message alone.

A tag with a pre-release part, such as `v0.2.0-rc.1`, is published as a
pre-release.

## Setting up verification

The workflow checks the signature against two repository variables, and
publishes nothing while both are empty. They are variables rather than
files, because the workflow runs on the tagged commit: a file there would
let the commit being released name its own signers. Only an administrator
can change a variable. A variable is no secret, though: a workflow can print
it, and GitHub does not mask it in the log, so both hold public keys only.
Set them under *Settings → Secrets and variables → Actions → Variables*;
either may be left unset.

`RELEASE_ALLOWED_SIGNERS` lists the SSH keys, one line per signer, in the
format of git's `gpg.ssh.allowedSignersFile`:

```
name@example.org namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

Lines starting with `#` are comments. Sign with the matching key:

```console
$ git config gpg.format ssh
$ git config user.signingKey ~/.ssh/id_ed25519.pub
```

`RELEASE_ALLOWED_PGP_KEYS` holds the OpenPGP public keys, ASCII armored, one
block after the other, as `gpg --armor --export <fingerprint>` prints them.
Any key in it may sign, however gpg would otherwise trust it. The workflow
knows only what the variable holds: a key that has expired no longer
verifies, but a revoked key verifies until the variable holds its
revocation, so export the key again after revoking it, or remove it. Sign
with the key:

```console
$ git config gpg.format openpgp
$ git config user.signingKey <fingerprint>
```

A writer who may change workflows could still edit the check out of
`release.yml` in the commit they tag. Two settings close that, and belong
with the variables:

- a tag ruleset on `v*` that lets only the maintainers who sign releases
  create such a tag, and nobody update or delete one;
- protection rules on the `release` environment, which the publishing job
  runs in: deployment limited to `v*` tags, and a required reviewer if a
  second person is to confirm each release.

## The third-party licence listing

The binary contains software that is not GSI's: the Go modules it links, the
Go standard library, and the npm packages bundled into the UI, the fonts
among them. Their licences ask to travel with a copy, so every archive
carries `THIRD-PARTY-NOTICES.txt`: each of them with its version, the name
of its licence and the licence text
([0002](adr/0002-apache-2-0-and-reuse.md),
[0019](adr/0019-version-in-a-signed-tag.md)). The file is generated at the
release build and is not committed.

`make notices` writes it to `dist/THIRD-PARTY-NOTICES.txt`, with
`.github/scripts/third-party-notices.mjs`. The two lists are derived like
this:

- **Go modules.** `go list -deps ./cmd/sdash` names the module of every
  package the command imports. It is asked once for each of the four release
  targets, since a package may be built for one system only, and the result
  is the union. A module only the tests need, such as testify, is not
  linked and not listed.
  [go-licenses](https://github.com/google/go-licenses), at the exact release
  the script names, classifies each module's licence and finds its file. The
  script installs it into a temporary directory; nothing is installed for
  the user. The standard library and the runtime are no module, so the
  script adds them itself, with the `LICENSE` of the toolchain that runs it,
  which is the one that builds the release.
- **npm packages.** `web/package-lock.json` marks every package that only
  development needs. The others are what `dependencies` in
  `web/package.json` names and what those depend on in turn, and they are
  listed, each with the `license` of its own `package.json` and the licence
  files in its directory under `web/node_modules`. The fonts come as npm
  packages and are listed like any other.

The npm list is right as long as `web/package.json` keeps to its rule: what
the bundle contains is under `dependencies`, and a tool is under
`devDependencies` ([0013](adr/0013-frontend-stack.md)). A package the UI
imports but lists as a tool would be bundled and not listed, and nothing
checks for that yet.

The script stops, and with it the release, when a module the go command
names is missing from what go-licenses reports, when a licence cannot be
named, when a package comes without a licence text, or when an installed
package is not the version the lockfile names. CI runs it in the Build job,
so a dependency with such a gap fails in the pull request that adds it.

GoReleaser wants `dist/` empty when it starts to build, so the file is moved
to `bin/` first and the archives take it from there.

## The Go toolchain

`go.mod` says `go 1.26.0`: the oldest Go that compiles the code. The
workflows build with the newest patch of the 1.27 line instead, the `go` of
`mise.toml`, which `.github/actions/setup-go` reads and resolves with
`check-latest`, because Go ships security fixes to the standard library as
patch releases, and a binary is only as patched as the toolchain that linked
it ([0020](adr/0020-go-lines-tools-and-libraries.md)). `govulncheck` runs in
CI against that same toolchain, so a vulnerability reachable from sdash
fails the build until a patch release fixes it.

`sdash version` reports the toolchain a binary was built with. Moving to the
next Go release line means changing `go` in `mise.toml`; raising the minimum
means changing `go.mod`.

## Provenance

Every archive is attested with `actions/attest`, which binds its digest to
the workflow, the commit and the tag that produced it, and signs that
statement with a short-lived Sigstore certificate. Nothing has to be
published for a user to check it:

```console
$ sha256sum --check --ignore-missing checksums.txt
$ gh attestation verify sdash_linux_amd64.tar.gz --repo GSI-HPC/sdash \
    --signer-workflow GSI-HPC/sdash/.github/workflows/release.yml \
    --source-ref refs/tags/v0.1.0
```

The tag is that of the release the archive was downloaded from. Without the
last two options the command accepts an attestation made by any workflow on
any branch of the repository, which everyone who can push a branch can
write. `--signer-workflow` asks for the release workflow, and `--source-ref`
is what ties the archive to the signed tag: only the signers the tag ruleset
names can create a `v*` ref
([Setting up verification](#setting-up-verification)).

`checksums.txt` answers "are these the bytes that were published"; the
attestation, checked like this, answers "which workflow built them, from
which tag". A download is worth both.

## Version numbers

Versions are semantic versions, `vX.Y.Z`. The first release is v0.1.0. Until
1.0.0, a minor release may also make the changes that would otherwise need
a major one, and says so in its notes.

What counts as a breaking change, across the command line, the profile file
and the browser API, is not defined yet; record
[0019](adr/0019-version-in-a-signed-tag.md) lists that among its costs.

## Repository settings

Part of how this repository works is settings on GitHub, which no file in
the tree can make or show. The maintainer makes them once:

| Setting | Value | Record |
| --- | --- | --- |
| Merge methods for pull requests | Rebase merging only; merge commits and squash merging off | [0017](adr/0017-main-only-rebase-merge-conventional-commits.md) |
| Head branches | Deleted automatically when a pull request is merged | [0017](adr/0017-main-only-rebase-merge-conventional-commits.md) |
| Ruleset `main`, on the default branch | No deletion, no force push, linear history required. No required status checks and no required review | [0017](adr/0017-main-only-rebase-merge-conventional-commits.md) |
| Ruleset `release`, on tags `v*` | Only the maintainers who sign releases create one; nobody updates or deletes one | [0019](adr/0019-version-in-a-signed-tag.md) |
| Variables `RELEASE_ALLOWED_SIGNERS` and `RELEASE_ALLOWED_PGP_KEYS` | The public keys that may sign a release; see [Setting up verification](#setting-up-verification) | [0019](adr/0019-version-in-a-signed-tag.md) |
| Environment `release` | Deployment limited to `v*` tags; a required reviewer if wanted | [0019](adr/0019-version-in-a-signed-tag.md) |
| Private vulnerability reporting | On; `SECURITY.md` points at it | [0022](adr/0022-repository-security-baseline.md) |
| Secret scanning | On, with push protection | [0022](adr/0022-repository-security-baseline.md) |
| Code scanning | CodeQL, in its default setup | [0022](adr/0022-repository-security-baseline.md) |

A fork inherits none of them.
