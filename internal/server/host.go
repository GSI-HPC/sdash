// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"log/slog"
	"net"
	"net/http"
	"strconv"
)

// httpPort is the port a browser leaves out of the Host header, and so the
// one a request without a port in that header was sent to.
const httpPort = 80

// requestPort returns the port a request was sent to, as its Host header
// names it; a header without a port means the default port of HTTP. The
// header has passed allowHosts by the time anything asks.
func requestPort(r *http.Request) string {
	_, port, err := net.SplitHostPort(r.Host)
	if err != nil || port == "" {
		return strconv.Itoa(httpPort)
	}
	return port
}

// allowHosts refuses every request whose Host header is not one that
// answers accepts.
//
// This is the defence against DNS rebinding: a page of another site can
// make its own domain resolve to 127.0.0.1 and then reach this listener as
// its own origin, where the browser lets it read the answers. Such a
// request still names the foreign domain in Host, which is what gives it
// away.
func allowHosts(answers func(host string) bool, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !answers(r.Host) {
				logger.Warn("refusing a request for a host that is not this listener",
					"host", r.Host, "path", r.URL.Path)
				refuse(w, http.StatusForbidden, "this server answers to its loopback address only")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
