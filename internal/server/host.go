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

// httpPort is the port a browser leaves out of the Host header, and so the
// one a request without a port in that header was sent to.
const httpPort = 80

// allowedHosts returns the values of the Host header that listeners bound
// to addrs answer to, in lower case: each bound address with its port, and
// the name localhost with that port once the listeners hold it on both
// loopback addresses, 127.0.0.1 and ::1.
//
// With one address held, the name localhost and the loopback address of the
// other family are not among them, although both lead to this machine. A
// browser asked for localhost tries ::1 before 127.0.0.1, and on a shared
// host another user's process can hold the same port on the address sdash
// does not: it would be handed the launch token, and its pages would share
// an origin with sdash. A name sdash refuses is one nobody gets used to.
// With both addresses held there is no such process, and the name is
// answered (doc/adr/0012-local-listener-security.md).
//
// Nothing is added for --dev. The Vite dev server names this server by its
// own address when it proxies a request (web/vite.config.ts), as a browser
// that comes directly does.
func allowedHosts(addrs []*net.TCPAddr) map[string]bool {
	hosts := map[string]bool{}
	allow := func(host string, port int) {
		// JoinHostPort puts an IPv6 address in brackets, as the header has
		// it.
		name := strings.ToLower(net.JoinHostPort(host, strconv.Itoa(port)))
		hosts[name] = true
		if port == httpPort {
			hosts[strings.TrimSuffix(name, ":"+strconv.Itoa(httpPort))] = true
		}
	}

	var v4, v6 *net.TCPAddr
	for _, addr := range addrs {
		allow(addr.IP.String(), addr.Port)
		switch {
		case addr.IP.Equal(net.IPv4(127, 0, 0, 1)):
			v4 = addr
		case addr.IP.Equal(net.IPv6loopback):
			v6 = addr
		}
	}
	if v4 != nil && v6 != nil && v4.Port == v6.Port {
		allow("localhost", v4.Port)
	}
	return hosts
}

// forwardedHost reports whether host is a value of the Host header that a
// listener on a unix socket answers to: a name of the loopback interface,
// localhost, 127.0.0.1 or [::1], with any port or with none.
//
// A browser never connects to the socket. It connects to a TCP port on the
// user's own machine, the near end of a forward the user puts in front of
// the socket, and names that port in Host. The user chose the port and this
// server never learns it, so there is no port the check could ask for.
//
// What the check is there for, it still does. It stops a page that reaches
// that port under another name, which is DNS rebinding: such a page names
// its own domain, and no domain is among the three names. It does not stop
// another process on the user's machine, which can connect to the port of
// the forward as the browser does and name it as the browser does. That
// process is stopped by what it lacks, the token of the launch and the
// session cookie made of it, as it is on a TCP listener
// (doc/adr/0023-the-listeners-as-built.md).
func forwardedHost(host string) bool {
	host = strings.ToLower(host)
	name := host
	if address, port, err := net.SplitHostPort(host); err == nil {
		// Joined again, the two have to be the header as it came:
		// SplitHostPort also takes brackets around a name and an empty
		// port, and no browser writes either.
		if !isPort(port) || net.JoinHostPort(address, port) != host {
			return false
		}
		// Without the port, and with the brackets the header has around an
		// IPv6 address.
		name = strings.TrimSuffix(host, ":"+port)
	}
	return name == "localhost" || name == "127.0.0.1" || name == "[::1]"
}

// isPort reports whether port is a port number as a Host header carries it:
// decimal digits and nothing else. The session cookie is named after it
// (cookieName), so nothing else may get past the Host check.
func isPort(port string) bool {
	if port == "" || strings.TrimLeft(port, "0123456789") != "" {
		return false
	}
	_, err := strconv.ParseUint(port, 10, 16)
	return err == nil
}

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
