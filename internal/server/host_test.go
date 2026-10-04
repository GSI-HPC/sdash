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
		{name: "the Vite dev server outside --dev", host: "localhost:5173", want: http.StatusForbidden},
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

// The API is what the check protects most, and it has checks of its own
// that run later; a foreign host must not get as far as those.
func TestAForeignHostIsRefusedBeforeTheAPIIsAsked(t *testing.T) {
	t.Parallel()

	stub := &apiStub{}
	router := testRouter(withAPI(stub))
	r := signedIn(request(http.MethodGet, "/api/v1/status"))
	r.Host = "rebind.example:7374"

	got := serve(router, r)

	assert.Equal(t, http.StatusForbidden, got.Code)
	assert.Empty(t, stub.seen())
}

func TestAllowedHostsFollowTheBoundAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		addr *net.TCPAddr
		dev  bool
		want []string
	}{
		{
			// The port may be the fallback one, so the name is built from
			// what was bound, not from what was asked for.
			name: "the bound address with the bound port",
			addr: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 41233},
			want: []string{"127.0.0.1:41233"},
		},
		{
			name: "a loopback address other than 127.0.0.1 is a name of its own",
			addr: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 2), Port: 7374},
			want: []string{"127.0.0.2:7374"},
		},
		{
			name: "the IPv6 loopback address in brackets",
			addr: &net.TCPAddr{IP: net.IPv6loopback, Port: 7374},
			want: []string{"[::1]:7374"},
		},
		{
			// A browser leaves port 80 out of the Host header.
			name: "the bare address as well on the default port of HTTP",
			addr: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 80},
			want: []string{"127.0.0.1:80", "127.0.0.1"},
		},
		{
			name: "the bare IPv6 address keeps its brackets",
			addr: &net.TCPAddr{IP: net.IPv6loopback, Port: 80},
			want: []string{"[::1]:80", "[::1]"},
		},
		{
			name: "the hosts of the Vite dev server with --dev",
			addr: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 7374},
			dev:  true,
			want: []string{"127.0.0.1:7374", "localhost:5173", "127.0.0.1:5173"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			hosts := allowedHosts(tt.addr, tt.dev)

			// The whole list, so that a name added to it by mistake fails
			// here: every name it holds is one a browser is trusted under.
			assert.ElementsMatch(t, tt.want, slices.Collect(maps.Keys(hosts)))
		})
	}
}

// The development loop reaches the server through Vite's proxy, which
// forwards the browser's Host header as it came.
func TestDevAnswersToTheHostsOfTheViteDevServer(t *testing.T) {
	t.Parallel()

	r := request(http.MethodGet, "/")
	r.Host = "localhost:5173"

	assert.Equal(t, http.StatusOK, serve(testRouter(withDev), r).Code)
}
