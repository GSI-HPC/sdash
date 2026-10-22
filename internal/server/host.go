// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net"
	"net/http"
	"strconv"
)

// httpPort is the port a browser leaves out of the Host header, and so the
// one a request without a port in that header was sent to.
const httpPort = 80

// requestPort returns the port a request was sent to, as its Host header
// names it; a header without a port means the default port of HTTP. The
// header has passed localweb.Hosts by the time anything asks.
func requestPort(r *http.Request) string {
	_, port, err := net.SplitHostPort(r.Host)
	if err != nil || port == "" {
		return strconv.Itoa(httpPort)
	}
	return port
}
