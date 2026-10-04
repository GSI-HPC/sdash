<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0006: Reach slurmrestd directly or through the system ssh

Status: accepted

## Context

sdash connects to a slurmrestd the site operates
([0003](0003-http-to-an-existing-slurmrestd.md)), and sites expose it in
different ways: over HTTPS, inside the site network only, under a path
prefix, or not to users at all
([research/slurmrestd.md](../research/slurmrestd.md#7-how-sites-expose-slurmrestd)).
A slurmrestd, and the sackd it runs beside, may be reachable only behind a
given sshd. How the production slurmrestd at GSI will listen, on a TCP port
or on a unix socket, is not decided.

## Decision

A cluster profile names the endpoint and how to reach it
([initial-conclusions.md](../initial-conclusions.md#4-connectivity)):

- **The endpoint** is a TCP address, given as an `http://` or `https://`
  URL with an optional base path and CA file, or the path of a unix socket.
  Both are supported, because the listen mode of the production slurmrestd
  is open.
- **The route** is direct, or through SSH: the same endpoint behind a given
  sshd. For that sdash runs the system `ssh` client to forward the
  connection. It does not speak SSH itself and never handles SSH
  credentials.

How to reach the endpoint and how to authenticate to it are separate
settings ([0007](0007-jwt-and-the-token-source.md)).

## Why

- The user's `~/.ssh/config`, jump hosts, multiplexing and multi-factor
  login apply unchanged. A second SSH client inside sdash would differ from
  the one the user debugs with.
- clusterctl drives OpenSSH for the same reason (its
  [record 0004](https://github.com/GSI-HPC/clusterctl/blob/main/doc/adr/0004-drive-openssh.md)).

## Costs

- An OpenSSH client has to be installed where sdash runs. It is one more
  process per cluster, and its failures arrive as an exit code and a line
  of standard error, not as a typed error.
- Whatever ssh asks the user, a passphrase or a second factor, it asks
  itself. sdash has to leave it a way to do so.
- The sshd has to permit forwarding (`AllowTcpForwarding`,
  `AllowStreamLocalForwarding`). A site that turns it off rules this route
  out.
- Two kinds of endpoint and two routes are written and tested while none is
  confirmed for production. One of them may never be used.
- The route through SSH can be tested end to end only once sind runs a
  slurmrestd ([0016](0016-e2e-and-fixtures-on-sind.md)).
