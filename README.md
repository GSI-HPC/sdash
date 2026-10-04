<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# sdash

[![CI](https://github.com/GSI-HPC/sdash/actions/workflows/ci.yml/badge.svg)](https://github.com/GSI-HPC/sdash/actions/workflows/ci.yml)

**A Slurm dashboard that runs on your own machine.** sdash is designed as
one static binary with its web interface embedded: it listens on loopback,
opens your browser, and talks HTTP to the slurmrestd your site already runs,
directly or through SSH, under your own Slurm identity, so that Slurm itself
decides what you may see and do. The Slurm-facing part does not exist yet;
[Status](#status) says what does.

## Status

sdash is a scaffold. The repository holds the decisions the project starts
from ([`doc/adr/`](doc/adr/)), the build and its checks, and a binary that
listens on loopback, prints its address, signs the browser in and serves the
shell of the interface: a header, a theme toggle and a page that says which
sdash is running, which it asks of the first operation of the browser API.
There is no release.

There is no Slurm-facing code: nothing here connects to a slurmrestd, and no
view shows a job or a node. That code is to be tested end to end against
clusters that [sind](https://github.com/GSI-HPC/sind) creates, which are also
where every test fixture and every vendored slurmrestd specification will
come from, and sind does not run a slurmrestd yet
([sind issue 90](https://github.com/GSI-HPC/sind/issues/90)). Until it
does, the work here is on the shell of the interface and its primitives
([`doc/adr/0016-e2e-and-fixtures-on-sind.md`](doc/adr/0016-e2e-and-fixtures-on-sind.md));
[`doc/sind-requirements.md`](doc/sind-requirements.md) says what sdash needs
from sind.

Where sdash is going is written down in the decision records and, in more
detail, in [`doc/initial-conclusions.md`](doc/initial-conclusions.md), the
first architecture position, which is dated and not kept up to date: where a
record differs, the record holds. [`doc/design/`](doc/design/) holds the
design of the interface, and [`doc/research/`](doc/research/) what was
learnt about slurmrestd and about
[Radar](https://github.com/skyhook-io/radar), the Kubernetes UI whose shape
and look sdash follows without taking any of its code.

## Install

There is no release to install yet. The first will be v0.1.0: one archive
for each platform, `sdash_<os>_<arch>.tar.gz` for Linux and macOS on amd64
and arm64, with a `checksums.txt` and a build provenance attestation. Each
archive carries the licences of the third-party code the binary embeds
([`doc/adr/0019-version-in-a-signed-tag.md`](doc/adr/0019-version-in-a-signed-tag.md)).

Until then sdash is built from a checkout, which needs Go and Node (see
[Contributing](#contributing)):

```console
$ make build      # the UI, then bin/sdash with the UI embedded
$ bin/sdash       # listens on 127.0.0.1:7374 and opens the browser
```

## Supported Slurm releases

Slurm 25.11 and later
([`doc/adr/0004-slurm-25-11-is-the-floor.md`](doc/adr/0004-slurm-25-11-is-the-floor.md)).
sdash connects to a slurmrestd that the site runs and never starts one; it
speaks HTTP to it and nothing else, and the interface adapts to what that
server's REST API offers
([`doc/adr/0005-versions-releases-and-capabilities.md`](doc/adr/0005-versions-releases-and-capabilities.md)).
A release is dropped when SchedMD's support for it has ended and no cluster
at GSI runs it any more.

These are the releases sdash is written for. No code speaks to Slurm yet
(see [Status](#status)), so none has been tested.

## Versions

A release is a signed tag `vX.Y.Z`, and the message of the tag is its
release notes, published on the
[releases page](https://github.com/GSI-HPC/sdash/releases). Nothing in the
tree names a version; `sdash version` prints the one a binary was built
from. Until 1.0.0 a minor release may make breaking changes, and its notes
say so
([`doc/adr/0019-version-in-a-signed-tag.md`](doc/adr/0019-version-in-a-signed-tag.md)).

## Contributing

The repository carries a `mise.toml`, so the toolchain comes from
[mise](https://mise.jdx.dev) if you use it:

```console
$ mise install          # Go, golangci-lint, Node and sind, as CI uses them
$ make build            # the UI, then bin/sdash with the UI embedded
$ make test             # Go tests under the race detector
$ make lint             # golangci-lint
$ make test-ui          # the frontend's unit tests (Vitest)
$ make test-components  # its component tests, in a real browser
$ make lint-ui          # ESLint and Prettier
$ make dev              # print the two-terminal development loop
$ make help             # every other target
```

Commits are [Conventional Commits](https://www.conventionalcommits.org/),
and pull requests are rebase-merged onto `main`, so each commit of a pull
request has to stand as one
([`doc/adr/0017-main-only-rebase-merge-conventional-commits.md`](doc/adr/0017-main-only-rebase-merge-conventional-commits.md)).
How sdash is built and why is in [`doc/`](doc/), and a change that takes a
decision adds a record under [`doc/adr/`](doc/adr/). Instructions for coding
agents are in [`AGENTS.md`](AGENTS.md). Report vulnerabilities as
[`SECURITY.md`](SECURITY.md) says.

There is no contributor agreement and no sign-off. A contributor from
outside GSI keeps the copyright of their contribution, licenses it under
Apache-2.0, and adds an `SPDX-FileCopyrightText` line of their own to the
files they change
([`doc/adr/0002-apache-2-0-and-reuse.md`](doc/adr/0002-apache-2-0-and-reuse.md)).

## AI disclosure

This project is developed with the help of AI coding tools. Changes written
by Anthropic's Claude Code agent are committed as
`Claude <noreply@anthropic.com>` and/or carry a `Co-Authored-By: Claude …`
trailer.

## Licence

Copyright 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH
<http://www.gsi.de>

Apache-2.0. See [`LICENSE`](LICENSE).
