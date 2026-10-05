// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"maps"
	"net"
	"net/http"
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
)

// With DNS rebinding a page of another site reaches the loopback port under
// its own domain, and the browser then lets it read the answers. The Host
// header is the one thing that still names the foreign domain.
func TestOnlyTheListenersOwnNamesAreAnswered(t *testing.T) {
	t.Parallel()

	router := testRouter()
	tests := []struct {
		name string
		host string
		want int
	}{
		{name: "the bound address", host: "127.0.0.1:7374", want: http.StatusOK},
		// The listener holds 127.0.0.1 alone. Whoever holds the port on
		// ::1 is where a browser asked for localhost goes first, so the
		// name is not one of this listener's.
		{name: "localhost", host: "localhost:7374", want: http.StatusForbidden},
		{name: "localhost in another case", host: "LocalHost:7374", want: http.StatusForbidden},
		{name: "the loopback address of the other family", host: "[::1]:7374", want: http.StatusForbidden},
		{name: "a rebound domain", host: "rebind.example:7374", want: http.StatusForbidden},
		{name: "a domain that only starts like a loopback name", host: "127.0.0.1.rebind.example:7374", want: http.StatusForbidden},
		{name: "a subdomain of localhost", host: "evil.localhost:7374", want: http.StatusForbidden},
		{name: "a loopback name with another port", host: "localhost:7375", want: http.StatusForbidden},
		{name: "a loopback name without the port", host: "localhost", want: http.StatusForbidden},
		{name: "another loopback address than the bound one", host: "127.0.0.2:7374", want: http.StatusForbidden},
		{name: "the Vite dev server", host: "localhost:5173", want: http.StatusForbidden},
		{name: "no host at all", host: "", want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			r := request(http.MethodGet, "/")
			r.Host = tt.host

			got := serve(router, r)

			assert.Equal(t, tt.want, got.Code)
			if tt.want == http.StatusForbidden {
				assert.NotContains(t, got.Body.String(), indexBody)
			}
		})
	}
}

// Once sdash itself holds the port on 127.0.0.1 and on ::1, nobody else can
// be where a browser asked for localhost ends up, and the name is safe to
// answer to. The port is still part of every name.
func TestAListenerOnBothLoopbackAddressesAnswersToLocalhost(t *testing.T) {
	t.Parallel()

	router := testRouter(onBothAddresses)
	tests := []struct {
		name string
		host string
		want int
	}{
		{name: "the IPv4 loopback address", host: "127.0.0.1:7374", want: http.StatusOK},
		{name: "the IPv6 loopback address", host: "[::1]:7374", want: http.StatusOK},
		{name: "localhost", host: "localhost:7374", want: http.StatusOK},
		{name: "localhost in another case", host: "LocalHost:7374", want: http.StatusOK},
		{name: "localhost with another port", host: "localhost:7375", want: http.StatusForbidden},
		{name: "localhost without the port", host: "localhost", want: http.StatusForbidden},
		{name: "a subdomain of localhost", host: "evil.localhost:7374", want: http.StatusForbidden},
		{name: "a rebound domain", host: "rebind.example:7374", want: http.StatusForbidden},
		{name: "another loopback address", host: "127.0.0.2:7374", want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			r := request(http.MethodGet, "/")
			r.Host = tt.host

			assert.Equal(t, tt.want, serve(router, r).Code)
		})
	}
}

// A browser reaches a unix socket through a forward from a loopback port of
// the user's own machine. Which port that is, the user decides and the
// server never learns, so every port is taken. Rebinding is still stopped:
// a page that reaches the forward under its own domain names that domain.
func TestAListenerOnASocketAnswersToTheLoopbackNamesUnderAnyPort(t *testing.T) {
	t.Parallel()

	router := testRouter(onSocket)
	tests := []struct {
		name string
		host string
		want int
	}{
		{name: "the IPv4 loopback address with the suggested port", host: "127.0.0.1:7374", want: http.StatusOK},
		{name: "the IPv4 loopback address with another port", host: "127.0.0.1:18080", want: http.StatusOK},
		{name: "localhost with a port", host: "localhost:8000", want: http.StatusOK},
		{name: "localhost in another case", host: "LocalHost:8000", want: http.StatusOK},
		{name: "the IPv6 loopback address with a port", host: "[::1]:8000", want: http.StatusOK},
		// A forward from port 80 is named without a port.
		{name: "localhost without a port", host: "localhost", want: http.StatusOK},
		{name: "the IPv4 loopback address without a port", host: "127.0.0.1", want: http.StatusOK},
		{name: "the IPv6 loopback address without a port", host: "[::1]", want: http.StatusOK},

		{name: "a rebound domain", host: "rebind.example:7374", want: http.StatusForbidden},
		{name: "a rebound domain without a port", host: "rebind.example", want: http.StatusForbidden},
		{name: "a domain that only starts like a loopback name", host: "127.0.0.1.rebind.example:7374", want: http.StatusForbidden},
		{name: "a domain that only ends like a loopback name", host: "rebind.example.localhost", want: http.StatusForbidden},
		{name: "a subdomain of localhost", host: "evil.localhost:7374", want: http.StatusForbidden},
		// Only the three names: another address of the loopback network is
		// one no forwarding hint ever names.
		{name: "another loopback address", host: "127.0.0.2:7374", want: http.StatusForbidden},
		{name: "the IPv6 loopback address without its brackets", host: "::1", want: http.StatusForbidden},
		{name: "a name in brackets", host: "[localhost]:8000", want: http.StatusForbidden},
		// The cookie is named after the port, so what stands there has to
		// be a number.
		{name: "a port that is no number", host: "localhost:http", want: http.StatusForbidden},
		{name: "a port with a sign", host: "localhost:+80", want: http.StatusForbidden},
		{name: "a port beyond the range", host: "localhost:65536", want: http.StatusForbidden},
		{name: "an empty port", host: "localhost:", want: http.StatusForbidden},
		{name: "no host at all", host: "", want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			r := request(http.MethodGet, "/")
			r.Host = tt.host

			got := serve(router, r)

			assert.Equal(t, tt.want, got.Code)
			if tt.want == http.StatusForbidden {
				assert.NotContains(t, got.Body.String(), indexBody)
			}
		})
	}
}

// A router that was told of no address and of no socket was put together
// wrongly. It must then answer to nothing, and not to everything.
func TestARouterWithoutAnAddressAnswersToNoHost(t *testing.T) {
	t.Parallel()

	router := testRouter(func(cfg *routerConfig) { cfg.addrs = nil })

	for _, host := range []string{"127.0.0.1:7374", "localhost:7374", "localhost", ""} {
		r := request(http.MethodGet, "/")
		r.Host = host

		assert.Equal(t, http.StatusForbidden, serve(router, r).Code, host)
	}
}

// The API is what the check protects most, and it has checks of its own
// that run later; a foreign host must not get as far as those.
func TestAForeignHostIsRefusedBeforeTheAPIIsAsked(t *testing.T) {
	t.Parallel()

	for name, change := range map[string]func(*routerConfig){
		"on one address":     func(*routerConfig) {},
		"on both addresses":  onBothAddresses,
		"on a unix socket":   onSocket,
		"on a socket, --dev": func(cfg *routerConfig) { onSocket(cfg); withDev(cfg) },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter(withAPI(stub), change)
			r := signedIn(request(http.MethodGet, "/api/v1/status"))
			r.Host = "rebind.example:7374"

			got := serve(router, r)

			assert.Equal(t, http.StatusForbidden, got.Code)
			assert.Empty(t, stub.seen())
		})
	}
}

func TestAllowedHostsFollowTheBoundAddresses(t *testing.T) {
	t.Parallel()

	v4 := func(port int) *net.TCPAddr { return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: port} }
	v6 := func(port int) *net.TCPAddr { return &net.TCPAddr{IP: net.IPv6loopback, Port: port} }
	tests := []struct {
		name  string
		addrs []*net.TCPAddr
		want  []string
	}{
		{
			// The port may be the fallback one, so the name is built from
			// what was bound, not from what was asked for.
			name:  "the bound address with the bound port",
			addrs: []*net.TCPAddr{v4(41233)},
			want:  []string{"127.0.0.1:41233"},
		},
		{
			name:  "a loopback address other than 127.0.0.1 is a name of its own",
			addrs: []*net.TCPAddr{{IP: net.IPv4(127, 0, 0, 2), Port: 7374}},
			want:  []string{"127.0.0.2:7374"},
		},
		{
			name:  "the IPv6 loopback address in brackets",
			addrs: []*net.TCPAddr{v6(7374)},
			want:  []string{"[::1]:7374"},
		},
		{
			// A browser leaves port 80 out of the Host header.
			name:  "the bare address as well on the default port of HTTP",
			addrs: []*net.TCPAddr{v4(80)},
			want:  []string{"127.0.0.1:80", "127.0.0.1"},
		},
		{
			name:  "the bare IPv6 address keeps its brackets",
			addrs: []*net.TCPAddr{v6(80)},
			want:  []string{"[::1]:80", "[::1]"},
		},
		{
			name:  "localhost as well once both loopback addresses are held",
			addrs: []*net.TCPAddr{v4(7374), v6(7374)},
			want:  []string{"127.0.0.1:7374", "[::1]:7374", "localhost:7374"},
		},
		{
			name:  "the bare names as well on the default port of HTTP",
			addrs: []*net.TCPAddr{v4(80), v6(80)},
			want:  []string{"127.0.0.1:80", "127.0.0.1", "[::1]:80", "[::1]", "localhost:80", "localhost"},
		},
		{
			// The other address on that port may be another process's.
			name:  "not localhost while the two addresses are held on different ports",
			addrs: []*net.TCPAddr{v4(7374), v6(7375)},
			want:  []string{"127.0.0.1:7374", "[::1]:7375"},
		},
		{
			// The name localhost stands for 127.0.0.1 and for no other
			// address of its network.
			name:  "not localhost with another IPv4 loopback address than 127.0.0.1",
			addrs: []*net.TCPAddr{{IP: net.IPv4(127, 0, 0, 2), Port: 7374}, v6(7374)},
			want:  []string{"127.0.0.2:7374", "[::1]:7374"},
		},
		{name: "nothing without an address", want: []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			hosts := allowedHosts(tt.addrs)

			// The whole list, so that a name added to it by mistake fails
			// here: every name it holds is one a browser is trusted under.
			assert.ElementsMatch(t, tt.want, slices.Collect(maps.Keys(hosts)))
		})
	}
}

// The Vite dev server proxies the API calls of the development loop and
// names this server by its own address when it does (web/vite.config.ts).
// So --dev adds no name to the list, and the Host check is as strict in the
// development loop as outside it.
func TestDevAddsNoHostToTheOnesAnswered(t *testing.T) {
	t.Parallel()

	router := testRouter(withDev)

	own := request(http.MethodGet, "/")
	assert.Equal(t, http.StatusOK, serve(router, own).Code)

	for _, host := range []string{"localhost:5173", "127.0.0.1:5173"} {
		r := request(http.MethodGet, "/")
		r.Host = host

		assert.Equal(t, http.StatusForbidden, serve(router, r).Code, host)
	}
}
