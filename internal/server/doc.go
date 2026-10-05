// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package server is the HTTP server sdash runs for the user's browser. It
// owns the listener, the checks a request has to pass, the serving of the
// user interface, and the place where the browser API is mounted.
//
// It exists so that the rules of the local listener live in one place
// (doc/adr/0012-local-listener-security.md, and for how the two kinds of
// listener were built doc/adr/0023-the-listeners-as-built.md). sdash acts
// as the user who started it, and whoever can send it a request acts as
// that user.
//
// There are two kinds of listener, and Config.Listen chooses between them:
//
//   - A TCP port on loopback, for a machine the user has alone. The name
//     localhost binds the port on 127.0.0.1 and on ::1, and both are served
//     by the one handler; a literal address binds that address only. A
//     loopback port is open to every process on the host and to every page
//     in the user's browser.
//   - A unix socket, for a host shared with other users, who could connect
//     to a loopback port and share the origin of the interface with sdash.
//     The socket binds no port, and nobody but the user may connect to
//     it. It lies in a directory of the user's that nobody else can write
//     to, below directories that nobody but the user and the system can
//     rearrange, and is named without a symbolic link, so that nobody can
//     put another socket under its path (privateDir). A browser cannot open
//     a socket, so the user puts a forward in front of it, from a port of
//     the machine the browser is on.
//
// On either, a request is served only if it passes these checks, in this
// order:
//
//   - It names the listener by a name the server answers to. On TCP that is
//     each bound address with its port, and the name localhost once the
//     server itself holds the port on both loopback addresses; with one
//     address held, the name may lead a browser to another process on the
//     other. A unix socket has no port: the browser connects to the port
//     of the forward, on its own machine, and names that one, so the server
//     answers to the loopback names under any port. A page that reaches
//     the server through DNS rebinding names it by its own domain, and is
//     refused on both.
//   - Under /api/, it comes from a page of the server's own origin, for
//     every method: a read tells another page as much as a write changes.
//   - Under /api/, it carries the session cookie, which the server gives
//     only to a browser that presents the token of this launch. The cookie
//     is named after the port in the Host header, so that each sdash a
//     browser knows on one host name has a cookie of its own.
//   - Under /api/, in read-only mode (Config.ReadOnly), its method is GET,
//     HEAD or OPTIONS. This is enough to keep sdash from changing anything,
//     because no operation of the browser API changes something on a GET
//     (readsOnly).
//
// A route registered outside newRouter's guarded chain would skip the last
// three. That is why the browser API is not registered by its own package
// but handed in as one handler (Config.API), which the router wraps.
//
// Every response carries a Content-Security-Policy that allows the origin
// itself and nothing else, so a flaw in the user interface cannot load
// script from elsewhere or send what it reads to another host.
//
// The server holds no package-level state, and sets nothing that belongs to
// the whole process: everything it uses arrives in Config.
package server
