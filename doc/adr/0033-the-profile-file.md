<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0033: The profile file

Status: proposed

## Context

[0006](0006-direct-or-through-ssh.md), [0007](0007-jwt-and-the-token-source.md)
and [0012](0012-local-listener-security.md) speak of a profile file: the
place that names each cluster, its slurmrestd and where its token comes
from, and the only place a token command may be set, since that command
runs a program as the user. None of them says where the file is or what
it looks like.
[initial-conclusions.md](../initial-conclusions.md#9-configuration-persistence-packaging)
proposed a hand-edited TOML file under the XDG configuration directory,
which sdash reads and never rewrites. The Slurm client
([0032](0032-the-slurm-client-as-built.md)) takes an endpoint, a CA file and
a source of tokens, and the first views of cluster data need a cluster to
read from.

## Decision

- The profile file is `clusters.toml` in `$XDG_CONFIG_HOME/sdash/`, or in
  `~/.config/sdash/` when that variable is unset or relative. `--config`
  names another file. A default file that does not exist is a profile
  without clusters; a file that `--config` names has to exist.
- The file holds one `[[cluster]]` table for each cluster, in the order the
  interface lists them:

  ```toml
  [[cluster]]
  name     = "virgo"
  endpoint = "https://slurmrestd.example.org:6820"
  ca_file  = "site-ca.pem"
  token    = { command = ["ssh", "virgo", "scontrol", "token", "lifespan=3600"] }
  ```

  `name` is up to 63 letters, digits, dots, hyphens and underscores, and
  unique; it is a segment of the addresses of the browser API. `endpoint`
  and `ca_file` are those of the client. The token comes from exactly one
  of `command` (run without a shell), `file` (read again when needed) and
  `env` (the name of a variable).
- A relative path in the file is read against the file's directory, and a
  path that starts with `~/` against the home directory.
- A key sdash does not know, a missing or doubled name, and a cluster with
  no token or two are refused, and so is an endpoint the client cannot use.
  Each is a configuration error: sdash says what is wrong and where, and
  exits 2 before it starts anything.
- sdash reads the file at start, and never writes it. A start with
  `--config` asks for a server of its own, as `--listen` does
  ([0028](0028-one-sdash-server-per-user.md)).
- The file is read with `github.com/BurntSushi/toml`, a new direct
  requirement ([0020](0020-go-lines-tools-and-libraries.md)). It has no
  requirements of its own, implements TOML 1.0, and reports the keys a
  file holds that the structs do not name.

## Why

- A file the user edits by hand takes comments, and TOML has no indentation
  to get wrong, which YAML has.
- A token command on the command line or in a request of the browser would
  let something other than the user's own file decide what sdash runs.
- A misspelt key that is ignored is a setting the user believes in and does
  not have; refusing it costs one more start.

## Costs

- One more module to keep current, where a format of the standard library,
  JSON, would need none and would take no comments.
- A change of the file takes a restart of sdash, and a running sdash keeps
  the clusters it started with.
- The route through ssh and the unix socket of
  [0006](0006-direct-or-through-ssh.md) have no keys yet. They come with
  their transports, and a file written for this record stays valid then.
- The name of a cluster is part of the addresses of the browser API and of
  the interface, so renaming a cluster in the file breaks a bookmark.
