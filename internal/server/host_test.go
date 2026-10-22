// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// A router that was told of no address and of no socket was put together
// wrongly. It must then answer to nothing, and not to everything.
func TestARouterWithoutAnAddressAnswersToNoHost(t *testing.T) {
	t.Parallel()

	router := testRouter(func(cfg *routerConfig) { cfg.answers = answering() })

	for _, host := range []string{"127.0.0.1:7374", "localhost:7374", "localhost", ""} {
		r := request(http.MethodGet, "/")
		r.Host = host

		assert.Equal(t, http.StatusMisdirectedRequest, serve(router, r).Code, host)
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

			assert.Equal(t, http.StatusMisdirectedRequest, got.Code)
			assert.Empty(t, stub.seen())
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

		assert.Equal(t, http.StatusMisdirectedRequest, serve(router, r).Code, host)
	}
}
