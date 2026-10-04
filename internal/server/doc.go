// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package server is the HTTP server sdash runs for the browser on the same
// machine. It owns the listener, the checks a request has to pass, the
// serving of the user interface, and the place where the browser API is
// mounted.
//
// It exists so that the rules of the local listener live in one place
// (doc/adr/0012-local-listener-security.md). sdash acts as the user who
// started it, and a loopback port is open to every process on the host and
// to every page in the user's browser. A request is therefore served only if
// it passes these checks, in this order:
//
//   - It names the listener by the address and the port it is bound to. A
//     page that reaches the port through DNS rebinding names it by its own
//     domain, and is refused. So is the name localhost, which may lead to
//     another process on the other loopback address.
//   - Under /api/, it comes from a page of the server's own origin, for
//     every method: a read tells another page as much as a write changes.
//   - Under /api/, it carries the session cookie, which the server gives
//     only to a browser that presents the token of this launch.
//
// A route registered outside newRouter's guarded chain would skip the last
// two. That is why the browser API is not registered by its own package but
// handed in as one handler (Config.API), which the router wraps.
//
// Every response carries a Content-Security-Policy that allows the origin
// itself and nothing else, so a flaw in the user interface cannot load
// script from elsewhere or send what it reads to another host.
//
// Not everything the record decides is built. The server binds one loopback
// address; the listener on the other address family and the one on a unix
// socket are missing, and --read-only is reported to the user interface but
// refuses nothing, since no operation of the browser API changes anything
// yet.
//
// The server holds no package-level state: everything it uses arrives in
// Config.
package server
