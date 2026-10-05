<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Cluster profiles

A cluster profile tells sdash where the slurmrestd of one Slurm cluster is,
how to reach it and where the token comes from. This document says what a
profile looks like, where sdash reads profiles from, every rule a profile
has to keep, and what sdash says when it does not.

The format is a proposal: record
[0025](adr/0025-cluster-profiles-as-yaml-documents.md) is not accepted yet,
and `v1alpha1` promises nothing even once it is.

## What sdash does with a profile today

It reads it, checks it and lists the name of the cluster. Nothing more:

- sdash connects to nothing. No SSH is started, no token command is run, no
  token file or variable is read, and no request is sent to a slurmrestd
  ([0016](adr/0016-e2e-and-fixtures-on-sind.md)).
- Nothing a profile names is looked at. A token file need not exist, a host
  need not resolve, and a socket need not be there. A profile that passes
  the check is well formed; whether it works shows when sdash connects.
- sdash never writes a profile, and no profile can be changed through the
  browser API. The interface learns the names of the clusters and nothing
  else of them.

## An example

A profile is a YAML document. A file may hold several, separated by `---`.
The four below show every field there is.

```yaml
# Reached directly, over TLS with the site's own certificate authority. A
# proxy of the site serves slurmrestd below /restd. The token is in a
# variable of the environment sdash is started in.
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: vesta
spec:
  endpoint:
    url: https://slurm.example.org/restd
    caFile: /etc/pki/tls/certs/example-org-ca.pem
  token:
    env: SDASH_VESTA_TOKEN
---
# Reached through the login node: slurmrestd listens on a unix socket
# there. The token comes from a command, and its user name from here.
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: vesta-test
spec:
  endpoint:
    socket: /run/slurmrestd/slurmrestd.socket
  ssh:
    host: login.example.org
  token:
    command: [ssh, login.example.org, scontrol, token, lifespan=3600]
  user: alice
---
# Reached through the login node as well, where slurmrestd listens on a
# TCP port. The address is the one the login node reaches it at: localhost
# is the login node here, not the machine sdash runs on.
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: kepler
spec:
  endpoint:
    url: http://localhost:6820
  ssh:
    host: login.example.org
  token:
    command: [ssh, login.example.org, scontrol, token]
---
# A slurmrestd on this machine, with the token in a file.
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: dev
spec:
  endpoint:
    url: http://127.0.0.1:6820
  token:
    file: /home/alice/.config/sdash/dev.token
```

## Where profiles are read from

sdash reads one directory, the first of these that is named:

1. the directory `--config` names;
2. the directory the environment variable `SDASH_CONFIG` names;
3. `$XDG_CONFIG_HOME/sdash`, when `XDG_CONFIG_HOME` is an absolute path;
4. `~/.config/sdash`, on Linux and on macOS alike.

In that directory it reads every file whose name ends in `.yaml` and does
not begin with a dot, in the order of the names. A file named `.yml` is not
read, and neither is anything in a subdirectory. A symbolic link to a file
is followed.

A directory that does not exist holds no cluster. That is no error, since
it is how sdash is first started. When the directory was named with
`--config` or `SDASH_CONFIG` the server says so in a warning.

The clusters are listed by name. The order of the files, and of the
documents in a file, means nothing.

## The fields

| Field | | What it holds |
| --- | --- | --- |
| `apiVersion` | required | `sdash/v1alpha1` |
| `kind` | required | `Cluster` |
| `metadata` | required | What names the cluster |
| `metadata.name` | required | The name sdash lists the cluster under: at most 63 of `a-z`, `0-9` and `-`, beginning and ending with a letter or a digit. No two profiles have the same name |
| `spec` | required | Where the cluster is and how sdash is to speak to it |
| `spec.endpoint` | required | Where slurmrestd listens: exactly one of `url` and `socket` |
| `spec.endpoint.url` | | An `http://` or `https://` address with a host, and after it at most a port and a base path. The base path is what a proxy of the site puts in front of slurmrestd's own paths, `/slurm/` and `/slurmdb/`, and holds neither of them; without such a proxy there is none. With `spec.ssh` the address is the one the host behind the sshd reaches slurmrestd at: `http://localhost:6820` is then a port of that host |
| `spec.endpoint.socket` | | The absolute path of a unix socket. With `spec.ssh` it is a path on the host behind the sshd |
| `spec.endpoint.caFile` | optional | The absolute path of the certificate authority an `https://` URL is verified against |
| `spec.ssh` | optional | Present when the endpoint is reached through SSH; absent when it is reached directly |
| `spec.ssh.host` | required in `spec.ssh` | The host handed to the system `ssh`: a host name, an address, or a `Host` alias of your ssh configuration. The user, the port, a jump host and the keys stay in `~/.ssh/config` |
| `spec.token` | required | Where the token comes from: exactly one of `command`, `env` and `file` |
| `spec.token.command` | | A program and its arguments, as a list. sdash will run the program itself, without a shell, so a string is not split into words. The first item is the program and nothing else: a name without white space, which is looked up in `PATH`, or an absolute path |
| `spec.token.env` | | The name of the environment variable that holds the token |
| `spec.token.file` | | The absolute path of the file that holds the token |
| `spec.user` | optional | The Slurm user name, for a site whose tokens do not carry it |

Every value is text and is read as it is written. `0600`, `1e3`, `yes` and
`2026-10-05` are those characters, whatever YAML would otherwise take them
for, so an argument of a command needs no quotes to stay what it is. A
value YAML reads as nothing (an empty value, `~`, `null`) is no value.

A token has no place in a profile. There is no field for one, and a URL
with a user name or a password in it is refused. In what form a command
prints the token, and a file or a variable holds it, is
[not decided yet](#what-is-not-there-yet).

## Checking profiles

`sdash config check` reads the profiles as the server does at its start and
prints what it found:

```console
$ sdash config check
4 clusters in /home/alice/.config/sdash (from HOME)
NAME        ENDPOINT                                ROUTE                  TOKEN                                     FILE
dev         http://127.0.0.1:6820                   direct                 file /home/alice/.config/sdash/dev.token  clusters.yaml:49
kepler      http://localhost:6820                   ssh login.example.org  command ssh                               clusters.yaml:36
vesta       https://slurm.example.org/restd         direct                 env SDASH_VESTA_TOKEN                     clusters.yaml:7
vesta-test  unix:/run/slurmrestd/slurmrestd.socket  ssh login.example.org  command ssh                               clusters.yaml:20
```

`FILE` is the file and the line the name of the cluster is written in. Of a
token the check prints where it comes from and never the token: the name of
the variable and not its value, the path of the file and not its content,
and of a command the program alone, since an argument may be a secret.

When a profile is not valid, the check prints every problem of every file,
each with the file, the line and the column it is at, and exits 2. Here
`url` is misspelt in the first profile of the example, the command of the
second is written as one string, and a copy of the last was left behind in
`old.yaml`:

```console
$ sdash config check
sdash: the cluster profiles are not valid:
  /home/alice/.config/sdash/clusters.yaml:10:5: spec.endpoint.urll: unknown field "urll"; did you mean "url"?
  /home/alice/.config/sdash/clusters.yaml:27:5: spec.token.command: must be a list of strings, such as [a, b], not a string; sdash does not split a string into words
  /home/alice/.config/sdash/old.yaml:5:3: metadata.name: is a name another cluster has, at /home/alice/.config/sdash/clusters.yaml:49:3; remove one of them or give it a name of its own
```

The server prints the same and does not start. One profile that is not
valid keeps sdash from starting for every cluster: it does not run on half
a configuration.

A mistake is reported once. A misspelt key is not reported again as the
field that is missing because of it, and a field with several things wrong
with it, such as a URL, is reported for the first of them.

A problem names the place and the rule that is broken, and does not repeat
the value that broke it. That value may be a secret in the wrong field: the
token itself under `env`, a password in a URL, a command line with a
secret in it written as one item. What the check and the server print ends
in terminals, in the journal of a service and in bug reports. A key is
repeated, since a misspelt one has to be shown; a value is not.

What sdash cannot catch is a secret that keeps the rule of the field it
stands in. It cannot be told from a value and is listed as one: a token of
letters, digits and `_` alone under `spec.token.env` is the name of a
variable, and a token under `spec.ssh.host`, or as the first item of a
command, is a host or a program as far as the rules go.

| Exit code | Meaning |
| --- | --- |
| 0 | Every profile is valid, or there is none |
| 2 | A profile is not valid, or the configuration directory cannot be read |

## The rules and what sdash says

A problem is printed as `file:line:column: field: message`. The place is
that of the key of the field, of the item for an item of a list, and of the
mapping a missing field is missing from. In the messages below, `…` stands
for what differs from case to case: a key, a place, the kind of a thing, or
the words of the YAML library or of the operating system. It never stands
for a value that broke a rule.

A file as a whole:

| What is wrong | What sdash says |
| --- | --- |
| The file is not YAML | `is not YAML: …` |
| The name belongs to a directory, a named pipe, a socket or a device | `is …, and only a file is read as a profile` |
| The file cannot be opened or read | `cannot be read: …` |
| The file is larger than 1 MiB | `is larger than 1048576 bytes, which no profile is` |

A file that is not YAML is reported in the words of the YAML library, and
with the file alone as its place. The library names a line in its message
and no column, and the line is at times the one before the mistake. Of what
the file holds it repeats one thing, the name of an anchor that is used
with `*name` and defined nowhere.

A document:

| What is wrong | What sdash says |
| --- | --- |
| The document is a list or a string | `a profile is a mapping with apiVersion, kind, metadata and spec, not …` |
| No `apiVersion` | `is missing; this sdash reads "sdash/v1alpha1"` |
| Another `apiVersion` | `is not supported; this sdash reads "sdash/v1alpha1"` |
| No `kind` | `is missing; expected "Cluster"` |
| Another `kind` | `is not a kind this sdash reads; expected "Cluster"` |

A document of another version or kind is reported by that alone; its other
fields are not judged. The same holds when one of the two keys is written
in another way, such as `apiversion` or `Kind`: that key is reported as an
unknown field, with the one that was meant, and not as a key that is
missing.

Any field:

| What is wrong | What sdash says |
| --- | --- |
| A key that no field has, close to one that a field has | `unknown field …; did you mean …?` |
| A key that no field has | `unknown field …; the fields here are …`, or `unknown field …; the one field here is …` |
| A key written twice in one mapping | `is written twice; the first is in line …` |
| A key that is a list or a mapping | `a key must be a plain string, not …` |
| A string or a list where a mapping belongs | `must be a mapping, not …` |
| A list or a mapping where a string belongs | `must be a string, not …` |
| A mapping where a list belongs | `must be a list of strings, such as [a, b], not …` |
| A string where a list belongs | `must be a list of strings, such as [a, b], not a string; sdash does not split a string into words` |
| A field without a value | `has no value; give it one or remove it` |
| A value over several lines, or with a tab or an escape character in it | `holds a control character, such as a line break or a tab` |
| A NUL character | `holds a NUL character` |
| A value taken from an anchor with `*name` | `is an alias; a profile takes no anchors and aliases, so write the value out` |

An argument of `spec.token.command` may hold a line break or a tab, since a
program may need one; no other value may.

The fields of a Cluster:

| What is wrong | What sdash says |
| --- | --- |
| No `metadata` | `is missing; it names the cluster` |
| No `metadata.name` | `is missing; it is the name sdash lists the cluster under` |
| A name that is no DNS label | `is not a name sdash takes: a name is at most 63 of a-z, 0-9 and "-", and begins and ends with a letter or a digit` |
| A name another profile has | `is a name another cluster has, at …; remove one of them or give it a name of its own` |
| No `spec` | `is missing; it names the endpoint and the source of the token` |
| No `spec.endpoint` | `is missing; it names the slurmrestd by "url" or "socket"` |
| Neither `url` nor `socket` | `sets none of "url" and "socket"; it takes exactly one of them` |
| Both `url` and `socket` | `sets "url" and "socket"; it takes exactly one of them` |
| A URL that cannot be parsed, such as one with a port that is no number | `is not a URL; write http:// or https://, then the host, and a port and a base path where the endpoint has them` |
| A URL with a user name or a password | `holds a user name or a password; a profile holds no credential, and the token comes from spec.token` |
| A URL of another scheme, or without one | `does not begin with http:// or https://` |
| A URL without a host | `names no host` |
| A URL with a query or a fragment | `holds a query or a fragment; after the host an endpoint has a base path and nothing else` |
| A port outside 1 to 65535 | `the port is not between 1 and 65535` |
| A socket, a CA file or a token file at a relative path, or below `~` | `is not an absolute path; a relative path and "~" are not expanded` |
| A CA file without an `https://` URL | `only an https url is verified against a CA file` |
| `spec.ssh` without a host | `is missing; it names the host the endpoint is reached through` |
| An SSH host with anything but letters, digits, `.`, `_`, `:` and `-`, or beginning with `-` | `is not a host as sdash hands one to ssh: letters, digits, ".", "_", ":" and "-", not beginning with "-"; a user, a port or a jump host belongs in your ssh configuration` |
| No `spec.token` | `is missing; it names where the token comes from by "command", "env" or "file"` |
| None of `command`, `env` and `file` | `sets none of "command", "env" and "file"; it takes exactly one of them` |
| More than one of them | `sets … and …; it takes exactly one of them` |
| A command without an item | `is an empty list; it names a program and its arguments` |
| A command whose first item is empty | `is empty; the first item names the program` |
| A command whose first item holds white space, such as a command line written as one item | `holds white space; sdash does not split a string into words, so write the program and each of its arguments as an item of its own` |
| A command whose program is at a relative path, or below `~` | `is a relative path; the program is a name to look up in PATH or an absolute path, and "~" is not expanded` |
| A variable name with anything but letters, digits and `_`, or beginning with a digit; a token written in its place is such a name | `is not the name of an environment variable: letters, digits and "_", not beginning with a digit; env names the variable and does not hold the token` |
| A user name with anything but letters, digits, `.`, `_` and `-`, or beginning with `-` | `is not a user name: letters, digits, ".", "_" and "-", not beginning with "-"` |

The SSH host is held to so little because it becomes an argument of `ssh`:
one that began with `-` would be read as an option, and options of ssh run
commands.

The program of a token command is a name or an absolute path because it is
what sdash will execute. A name with a `/` in it is run as it stands, so a
relative one would be whatever lies in the directory sdash was started in.
A program whose own path holds a blank cannot be named; it is reached
through `PATH` or through a link.

Two problems are not about a profile and are printed without a list:

| What is wrong | What sdash says |
| --- | --- |
| What is named as the configuration directory is a file | `read the configuration directory: … is not a directory` |
| The configuration directory cannot be read | `read the configuration directory: …` |

## What is not there yet

- Connecting to a cluster, and with it everything that would show whether
  a profile works.
- The form of a token: what a token command has to print, and what a token
  file or variable has to hold. Slurm's documentation shows `scontrol token`
  printing `SLURM_JWT=` before the token, and whether sdash takes that line
  as it is, is not decided.
- A directory for a whole site, such as `/etc/sdash`, from which every user
  of a login node would get the site's clusters.
- A check of who owns the profile files and who may write them, which
  clusterctl makes of its configuration and sdash will need before it runs
  a token command.
- Showing or editing a profile in the interface. The SSH host and the token
  command will never be writable there
  ([0012](adr/0012-local-listener-security.md)).
- A schema that an editor could check a profile against while it is typed.
