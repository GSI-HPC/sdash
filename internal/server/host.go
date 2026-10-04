// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
)

// vitePort is the port of the Vite dev server ("npm run dev" in web/), which
// proxies /api to this server in the development loop "make dev" prints.
const vitePort = "5173"

// allowedHosts returns the values of the Host header the listener bound to
// addr answers to: the bound address with the bound port, in lower case, and
// nothing else.
//
// The name localhost and the loopback address of the other family are not
// among them, although both lead to this machine. The listener holds one
// address. A browser asked for localhost tries ::1 before 127.0.0.1, and on
// a shared host another user's process can hold the same port there: it
// would be handed the launch token, and its pages would share an origin
// with sdash. A name sdash refuses is one nobody gets used to. It can be
// answered again once sdash itself holds the port on both loopback
// addresses (doc/adr/0012-local-listener-security.md).
//
// With dev, the hosts of the Vite dev server are allowed too. Its proxy
// forwards the browser's Host header unless it is configured to rewrite it,
// and no browser can be made to send that Host to this listener's port, so
// allowing it opens nothing to a page.
func allowedHosts(addr *net.TCPAddr, dev bool) map[string]bool {
	// JoinHostPort puts an IPv6 address in brackets, as the header has it.
	bound := strings.ToLower(net.JoinHostPort(addr.IP.String(), strconv.Itoa(addr.Port)))
	hosts := map[string]bool{bound: true}
	// A browser leaves the default port of the scheme out of the header.
	if addr.Port == 80 {
		hosts[strings.TrimSuffix(bound, ":80")] = true
	}
	if dev {
		hosts["localhost:"+vitePort] = true
		hosts["127.0.0.1:"+vitePort] = true
	}
	return hosts
}

// allowHosts refuses every request whose Host header is not one of hosts.
//
// This is the defence against DNS rebinding: a page of another site can
// make its own domain resolve to 127.0.0.1 and then reach this listener as
// its own origin, where the browser lets it read the answers. Such a
// request still names the foreign domain in Host, which is what gives it
// away.
func allowHosts(hosts map[string]bool, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !hosts[strings.ToLower(r.Host)] {
				logger.Warn("refusing a request for a host that is not this listener",
					"host", r.Host, "path", r.URL.Path)
				refuse(w, http.StatusForbidden, "this server answers to its loopback address only")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
