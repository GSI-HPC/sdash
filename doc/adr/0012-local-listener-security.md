<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0012: The local listener trusts neither the host nor the browser

Status: accepted

## Context

The sdash process holds the user's Slurm token
([0007](0007-jwt-and-the-token-source.md)) and whoever can send it a request
acts as that user. Radar, the model, relies on a loopback bind and a check
of the Host header, with no token, and answers cross-origin requests from
any localhost port
([research/radar.md](../research/radar.md#local-security-model)).

That is not enough where sdash will run. On a shared login node other users
can connect to a loopback port. On any machine a page in the user's browser
can send requests to a loopback port, and with DNS rebinding it can read the
answers unless the server checks the name it is addressed by.

## Decision

As in
[initial-conclusions.md](../initial-conclusions.md#7-local-server-security):

- The server binds loopback only. `--listen` defaults to `127.0.0.1:7374`,
  and when the port is busy sdash takes a free one and says so. The position
  also names the IPv6 loopback address.
- Each launch makes a random token. The URL sdash opens carries it, and the
  server exchanges it for an `HttpOnly` cookie. The token is never passed on
  a command line.
- A Host allow-list refuses names that are not the listener's, against DNS
  rebinding.
- Every request under `/api` passes a same-origin check (`Origin`,
  `Sec-Fetch-Site`), reads included, not only the methods that change
  something.
- There is no CORS outside `--dev`, and the pages carry a strict
  Content-Security-Policy.
- A unix-socket listener exists for shared hosts.
- In a read-only mode, `--read-only`, sdash sends nothing that changes the
  cluster.
- The profile fields that make sdash execute something, the SSH host and
  the token command, are read from the profile file only and cannot be
  written through the HTTP API.

While sdash holds one loopback address, the Host allow-list answers to that
address with its port and to nothing else. The name `localhost` is refused:
a browser tries the other loopback address for it first, where another
process may hold the same port. The name is answered once sdash itself holds
the port on both addresses.

## Costs

- A user opens sdash through the URL of the current launch. A bookmark of
  an earlier one does not sign in.
- Whoever reads the URL while it is valid, on the terminal or in the
  browser's history, holds the token.
- A TCP port on loopback is not safe on a shared host, because the origin
  `http://127.0.0.1:<port>` is shared with every other local user. Three
  effects were confirmed in a browser, and no check of the listener sees
  them, because what is taken is the real credential:
  - The cookie holds the launch token, and a browser sends a cookie to
    every port of its host. Another user's listener on a loopback port that
    the browser visits once receives it. Sent again from a command line
    client, which sends neither `Origin` nor `Sec-Fetch-Site`, it passes
    every check.
  - Such a listener can set a cookie of the same name for the path `/api`,
    which the browser then sends first. sdash reads the first one only, so
    the interface is told it is not signed in until the cookie is deleted.
  - A process that held the port earlier, and that the browser visited
    once, can leave a service worker for the origin. It intercepts the
    sign-in of a later sdash on the same port and reads the token.
- The default port is fixed, and a busy one falls back to a free one, so on
  a shared host the port is predictable and "another user holds 7374" is
  the ordinary case.
- The unix-socket listener is the answer on shared hosts.
- A browser cannot open a unix socket, so that listener needs a forward in
  front of it, for example from the user's workstation through ssh.
- `--dev` accepts the Vite development origin, and so weakens the checks.
  It is for a developer's machine, not for a shared host.
- The fields that execute something cannot be edited in the UI. The user
  edits the profile file.
- Each check is code and tests that Radar's model does without, and a
  route added outside the `/api` middleware would skip them.
