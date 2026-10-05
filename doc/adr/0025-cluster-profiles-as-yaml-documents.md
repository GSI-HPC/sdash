<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0025: A cluster profile is a versioned YAML document

Status: proposed

## Context

Three records say what a cluster profile holds and none says what one looks
like: the endpoint and the route to it
([0006](0006-direct-or-through-ssh.md)), the source of the token
([0007](0007-jwt-and-the-token-source.md)), and that the two fields which
make sdash execute something are read from the profile file only
([0012](0012-local-listener-security.md)). The first architecture position
names a hand-edited TOML file under the XDG configuration directory, which
sdash reads and never rewrites
([initial-conclusions.md](../initial-conclusions.md#9-configuration-persistence-packaging)).
No record took that sentence up, and no code reads a profile.

clusterctl, the sibling, has configuration as YAML documents that carry an
`apiVersion` and a `kind`, read strictly, with every error at its file, line
and column (its records
[0003](https://github.com/GSI-HPC/clusterctl/blob/main/doc/adr/0003-layered-yaml-configuration.md)
and
[0025](https://github.com/GSI-HPC/clusterctl/blob/main/doc/adr/0025-yaml-v3.md)).
sind's cluster definitions are YAML documents with a `kind` as well. The
people who will write an sdash profile write both already.

Reading a profile needs no cluster, so it is not held back by
[0016](0016-e2e-and-fixtures-on-sind.md). Using one is.

## Decision

Proposed, for the maintainer to confirm or change:

- **The format.** A cluster profile is a YAML document with
  `apiVersion: sdash/v1alpha1` and `kind: Cluster`, as clusterctl's documents
  are. `v1alpha1` promises nothing: a field that has to change changes the
  version. [profiles.md](../profiles.md) is the reference, with an example
  and every rule.
- **Where profiles are read from.** One directory, the user's: the one
  `--config` names, else `$SDASH_CONFIG`, else `$XDG_CONFIG_HOME/sdash`, else
  `~/.config/sdash`, on every operating system. sdash reads every file in it
  whose name ends in `.yaml` and does not begin with a dot, in name order,
  and does not descend. A file may hold several documents. A directory that
  does not exist holds no cluster and is no error. sdash never writes there.
- **What a Cluster holds**, taken from the accepted records and nothing
  more: `metadata.name`, a DNS label, unique among the profiles read;
  `spec.endpoint`, exactly one of `url` (http or https, with an optional base
  path) and `socket` (the absolute path of a unix socket), with an optional
  `caFile` for an https URL; `spec.ssh.host` when the endpoint is reached
  through SSH, a host as the user's ssh configuration knows it;
  `spec.token`, exactly one of `command` (a list of arguments, never a
  string a shell would split; its first item is the program, a name to look
  up in `PATH` or an absolute path, in one word), `env` (the name of a
  variable) and `file` (a path); and an optional `spec.user` for a site
  whose tokens do not carry the user name.
- **Strict reading.** A key that no field has is an error at its file, line
  and column, with the field that was probably meant when one is close. So
  are a document of another kind or version, which is told what was
  expected, a key written twice, an alias, and a name that a second profile
  has, which names both places and never replaces the first. Every file is
  judged in one run, a mistake is reported once and not again as what
  follows from it, and any problem fails the whole read: sdash does not
  start on half a configuration.
- **A problem does not repeat the value.** It names the file, the line, the
  column, the field and the rule that is broken, and a key where a key is
  wrong. The value that broke the rule is left out: it may be a secret in
  the wrong field, the token itself where the name of its variable belongs
  or a password in a URL, and what sdash reports ends in terminals, in the
  journal of a service and in bug reports.
- **Every value is text**, read as it was written. `0600`, `1e3` and `yes`
  are what the user typed, whatever a YAML reader would make of them.
- **Reading runs nothing.** Nothing a profile names is executed, opened,
  resolved or looked up. A token file need not exist yet, and a socket may
  lie on the host behind the sshd.
- **The command line.** `sdash config check` reads the profiles as the
  server does and prints, for each cluster, its name, its endpoint, its
  route and where its token comes from, never a token; or every problem,
  with exit code 2. The server reads the profiles before it opens its
  listener, does not start on a problem, and reports the names of the
  clusters, sorted, in the status of the browser API.
- **The YAML library** is `go.yaml.in/yaml/v3`, the one clusterctl chose in
  its record 0025, as a direct requirement
  ([0020](0020-go-lines-tools-and-libraries.md)). Each document is decoded
  into a `yaml.Node`, which carries the line and the column of every key and
  value, and from there into the Go types by sdash's own strict decoder.

Not proposed here, and to come with records of their own where they take a
decision: connecting to a cluster; running the token command; the form of
a token, which is what a command has to print and what a file or a
variable has to hold (Slurm's documentation shows `scontrol token`, the
command 0007 suggests, printing `SLURM_JWT=` before the token); a profile
that a site provides for all its users; and showing or editing a profile in
the interface, where 0012 already rules out writing the SSH host and the
token command.

Open points this proposal leaves to the maintainer:

- A site-wide directory such as `/etc/sdash`, and what it means when both
  it and the user name the same cluster.
- A directory that `--config` or `SDASH_CONFIG` names and that does not
  exist: here it is reported, as a warning by the server and in the output
  of the check, and holds no cluster. clusterctl makes it an error.
- Who may own and write the profile files. clusterctl refuses a
  configuration file another user could have written, because it names
  programs to run. sdash will need the same before it runs a token command.

## Why

- **YAML, where the first position named TOML.** It is the format of the
  two tools a profile's author already configures, and clusterctl's
  convention comes with it ready to use: an `apiVersion`, a `kind`, and
  several documents to a file, for which TOML has no counterpart. The
  library is in the module graph already, through testify and cobra's
  documentation generator; a TOML library would be a new module. TOML's own
  merits are real: a string is always quoted, so nothing is ever read as a
  number by surprise, and there are no anchors, tags or indentation to get
  wrong. Reading every value as text and refusing aliases takes most of
  that back for a Cluster as it is today.
- **yaml.v3 and not another YAML library**, for clusterctl's reasons: the
  YAML organisation maintains it, and its `Node` carries positions.
  clusterctl moved to it from goccy/go-yaml, which was slow on large files
  and dropped the documents after an empty one without an error. It imports
  nothing outside the standard library, so nothing it brings can start a
  process or open a connection.
- **A decoder of sdash's own, no schema.** clusterctl validates against a
  JSON Schema generated from its Go types, with two more libraries. One kind
  with nine fields below `metadata` and `spec` does not need them: the field
  names are the `yaml` tags of the types, and the rules are a page of Go.
- **A profile is as trusted as a script** (0007), so a typo must not pass
  silently, and a stale copy of a file must not decide where sdash
  connects.

## Costs

- The YAML library was a requirement of the tests only. It is now linked
  into the binary, and is one more module whose advisories concern a
  release. The binary grows by about 350 kB, from 8.4 MB to 8.7 MB or by
  4 %, measured for linux/amd64 and built as a release is (static,
  `-trimpath`, `-ldflags '-s -w'`) with Go 1.27.1; with Go 1.26.8 it is
  about 375 kB. Some 240 kB of that is the library, which is what the tree
  before this change gains from one decode into a `yaml.Node` and nothing
  else. The library's v4 is a release candidate, and a move to it is
  another record.
- A file that is not YAML is reported in the library's words, with the line
  it names inside the message and without a column. That line is at times
  the one before the mistake, so sdash does not present it as a position.
- YAML stays YAML: indentation carries meaning, and a profile can be
  written in more ways than a reviewer expects. Reading every value as text
  works while every field is text. The first field that is a number or a
  boolean needs a decision on what its literals are, which clusterctl has
  taken and sdash has not.
- A profile that passes the check may still not work. Whether the host
  resolves, the file exists and the token is accepted shows only when sdash
  connects.
- A problem does not show what was written. The user reads the value at
  the place the problem names, and of a URL that cannot be parsed learns no
  more than that. A secret that keeps the rule of the field it stands in is
  not caught: it is listed as that field's value.
- The program of a token command cannot lie at a path with a blank in it,
  nor at a relative one. Such a program is reached through `PATH` or
  through a link.
- One profile that is not valid keeps sdash from starting for every
  cluster.
- Paths are absolute and `~` is not expanded, so a profile with a token
  file does not move unchanged between machines with different home
  directories.
- `~/.config` is not where a Mac user looks for configuration.
- A file that is passed over is passed over without a word: one named
  `.yml`, one in a subdirectory, one whose name begins with a dot.
- There is no schema for an editor to check a profile against while it is
  typed, which clusterctl offers.
- The loader follows a symbolic link to a file. Whoever can write the
  configuration directory decides what sdash reads, and nothing checks yet
  who that is.
- The reader is about 800 lines of Go of sdash's own, comments aside, with
  three times as many lines of tests and a fuzz target, where a library's
  lenient decoder would have been one call.
- Everything that starts sdash now reads the profiles of whoever starts it.
  The Go tests, the smoke test and the browser tests each name a directory
  of their own, and a test that starts sdash without one meets the clusters
  of the developer who runs it.
- `v1alpha1` promises nothing, so the first users may have to rewrite their
  profiles.
