<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0026: go-clikit's localweb for the listener and the guard

Status: accepted

## Context

[0012](0012-local-listener-security.md) decided what the local listener
holds against, and [0023](0023-the-listeners-as-built.md) recorded how it
was built: the two loopback addresses, the unix socket and its directories,
the Host allow-list, the same-origin check, the token and the cookie, the
security headers and the limits of the server. That code is in
`internal/server`. go-clikit v0.8.0 has a copy of it in `localweb`,
`localweb/session` and `localweb/localwebtest`, written from sdash's and
from the servers of two other tools, with the strictest rule of the three
for each check (decision 34 of go-clikit). Four copies drift, and a flaw
found in one has to be fixed in all.

## Decision

- **Requirement.** sdash imports `localweb` and `localweb/session`, and
  `localweb/localwebtest` in its tests. It does not import `localweb/sse`:
  it has no stream, and the browser polls
  ([0010](0010-read-through-cache-and-polling.md)).
- **Listener.** `localweb.Listen` binds the address `--listen` names, and
  `localweb.CheckAddr` refuses what is not a loopback address or a socket
  that fits. Everything 0023 decides about the listeners stays: the name
  `localhost` is the two literal addresses on one port, a port that is taken
  gives way to a free one, a host without `::1` is served on `127.0.0.1`,
  and a socket is bound in a staging directory of the mode 0700 and
  renamed into place, in a directory that only the user can change. The
  staging directory is named `.lw` and not `.sd`, and the wording of the
  errors of a socket that cannot be opened is localweb's. What stays in
  sdash is the log (a port that gave way, no IPv6), the default socket in
  `$XDG_RUNTIME_DIR`, the refusal of `~`, and the forwarding hint.
- **Server.** `localweb.Serve` serves with the same limits and stops the
  same way as 0023 has it.
- **The order of the checks.** The security headers, the Host allow-list,
  the same-origin check and the session come before the router looks at
  the address, so a request without a session learns nothing about which
  addresses exist. Under `/api/` the answer is then kept out of every cache
  and, with `--read-only`, refused by its method.
- **Host.** A request for a name the server does not answer to is refused
  with 421 Misdirected Request, in plain text, and not with 403.
- **Same origin.** The check covers the pages as well as the API. A page
  may be navigated to from anywhere, as a link in a mail is. The API takes
  no navigation, so an address of the API typed into the address bar is
  refused with `cross_origin`, where 0023 let it pass. A request that could
  change something has to name its `Origin`, where 0023 let a request with
  neither header pass. `--dev` adds the two origins of the Vite dev server
  for the API, as before.
- **Headers.** The policy is localweb's: `default-src 'none'` with the
  directives for script, style, image, font, connect, manifest and form
  action, and none for worker, frame or media. It replaces the one of 0012
  and allows less. `Referrer-Policy` is `same-origin` and not `no-referrer`,
  since under `no-referrer` a browser sends the POST of a form with the
  origin `null`. `X-Frame-Options`, `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Resource-Policy` are added.
- **Other users.** On a TCP listener, `localweb.PeerListener` closes the
  connection of a process of another user before a request is read, on
  Linux. It needs the user's ID, which `cli.Process` carries as `Getuid`.
  Where the system cannot say whose a connection is, such as macOS, sdash
  serves as before and logs once that the port is open to the host and that
  a unix socket keeps the others out. A listener on a socket needs no such
  check.
- **Session.** `localweb/session` trades the launch token for a session.
  The cookie keeps its name, `sdash_session_PORT`, and holds an identifier
  of the session and no longer the token. The session is checked for the
  pages too: a browser that is not signed in is told so, with where to find
  the address, and is not served the interface. The launch token is 43
  characters of base64.
- **CSRF.** A request that could change something carries the CSRF token of
  its session in the header `X-Sdash-CSRF`, and the session refuses one that
  does not, with the new Error code `csrf`, before any operation sees it.
  The operation `getSession` gives the page its token, and the client of
  `web/src/client` reads it once and sends it on every request but GET and
  HEAD. The statuses of the other refusals under `/api/` stay as
  `api/openapi.yaml` has them, 401 for `not_signed_in` included.

## Why

- A rule that is fixed once is fixed for every tool that uses it. The three
  that sdash did not have, the check of the pages, the check of the
  connection's owner and the CSRF token, are the ones another tool found it
  needed.
- The CSRF token is checked in front of the handlers, like the read-only
  mode, so that an operation added later is covered without anybody having
  to remember it. The first operation that changes something is the wrong
  moment to find that the page cannot send the token.
- The pages are served to a browser that is signed in. Without a session the
  interface fails on every request, and a text that says what to do is a
  better answer than that.

## Costs

- An address of the API typed into the bar no longer answers with its JSON.
  The interface does not do that, and a developer reads the answer in the
  network tab or with a client that is no browser.
- A client that is no browser has to send an `Origin` on a request that
  could change something, and the CSRF token, which it reads with
  `getSession` after it has signed in.
- The page of an sdash that a browser opens without the token is a refusal
  in plain text and not the interface.
- The launch token is longer, and an address that was copied from an earlier
  sdash holds a token that is not this one's, as before.
- The connections of other users are closed on Linux only. On macOS a TCP
  listener is as open as it was.
- Left open: a policy of `default-src 'none'` means that the interface may
  not load a worker or a frame, or play media, before a directive for it is
  added to the policy.
- Left open: the tests that bind both loopback addresses still fail on a
  machine without `::1`. The binding itself is tested in go-clikit.
