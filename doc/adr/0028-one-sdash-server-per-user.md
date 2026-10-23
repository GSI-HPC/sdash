<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0028: One sdash server per user

Status: accepted

## Context

A second `sdash` used to start a second server. Its port was taken, so it
fell back to a free one ([0023](0023-the-listeners-as-built.md)), and the
user had two servers, two launch tokens and two tabs that did not know of
each other. A user who has lost the tab only wants it back.
[0027](0027-go-clikit-launch-for-the-browser.md) took the opener from
go-clikit's `localweb/launch`, and left its `Instance` for later. The tools
that share the kit, sind and brig, keep one server per user with it.

## Decision

- **Guard.** A start takes the lock of `$XDG_RUNTIME_DIR/sdash` with
  `launch.Acquire`, the directory that also holds the default socket
  ([0023](0023-the-listeners-as-built.md)). The lock is held while the server
  starts, so that two starts cannot both find none.
- **A server that runs.** `Instance.Running` finds it by its record `ui.json`:
  the process lives, its address answers, and a socket of the user listens
  there. The start then prints `sdash is serving at ADDRESS`, as the first
  one did, opens the browser on it unless `--no-browser` or the environment
  says not to, and exits 0. It starts no server.
- **No server.** The start serves as before. Once the listener is bound it
  records the address with `Instance.Publish`, before it prints the address,
  and `Retire` removes the record when the server stops.
- **A server of its own.** A command line that names `--listen`, `--dev` or
  `--read-only` asks for a server that a running one cannot stand in for: a
  read-only start that opened the browser on a server that is not read-only
  would be a mistake the user could not see. Such a start neither looks for
  a server nor records one. Only a start without these flags is the server of
  the user.
- **No guard.** Without an absolute `$XDG_RUNTIME_DIR`, as on macOS, on a
  system that cannot lock, and when the directory is refused (not the
  user's, or not of mode 0700), the start serves as it did before. It says
  so with `-v`, or with a warning when the directory is refused. A guard
  that cannot be had is no reason not to serve.
- **Files.** `ui.lock` and `ui.json` are the kit's names. The record holds
  the address with the launch token and the process, in a file that only the
  user can read, as the redirect file does
  ([0012](0012-local-listener-security.md)).

## Why

- The user has one dashboard, and the address of it is one command away.
- The checks of `Running` keep the launch token from a process that is not the
  server: one that ended, or a port that another user's process took.
- A flag that changes what the server is cannot be answered by a server that
  was started without it.

## Costs

- A script that starts `sdash` and later stops its process finds that a
  second start ended at once, and that the server it printed belongs to
  another process.
- A start without flags while a read-only one runs starts another server, as
  the read-only one is not recorded.
- On macOS the guard does not exist: the owner of a socket cannot be told
  there, and `$XDG_RUNTIME_DIR` is not set.
- A server that was killed leaves its record. The next start checks it, and
  replaces it.
- The launch token of the server that runs is on disk, in a file of the mode
  0600 in a directory of the mode 0700, as it is in the redirect file. The
  system removes the runtime directory at the last logout.
