// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Every page in the user's browser can send a request to a loopback port.
// The session cookie is SameSite=Strict, but "site" ignores the port, so
// another program's page on localhost counts as the same site; the headers
// below are what tells such a page from sdash's own.
func TestTheAPIServesOnlyRequestsOfItsOwnOrigin(t *testing.T) {
	t.Parallel()

	const own = "http://" + testHost
	tests := []struct {
		name    string
		dev     bool
		headers []string
		want    int
	}{
		{name: "a fetch from the interface", headers: []string{"Sec-Fetch-Site", "same-origin", "Sec-Fetch-Mode", "cors"}, want: http.StatusOK},
		{name: "a fetch from the interface that names its origin", headers: []string{"Sec-Fetch-Site", "same-origin", "Origin", own}, want: http.StatusOK},
		{name: "an address the user typed", headers: []string{"Sec-Fetch-Site", "none", "Sec-Fetch-Mode", "navigate"}, want: http.StatusOK},
		{name: "a client that is no browser", want: http.StatusOK},
		{name: "a browser without Sec-Fetch-Site that names the own origin", headers: []string{"Origin", own}, want: http.StatusOK},

		{name: "a page of another site", headers: []string{"Sec-Fetch-Site", "cross-site", "Sec-Fetch-Mode", "cors"}, want: http.StatusForbidden},
		{
			// Another port of localhost: another program, or on a shared
			// host another user.
			name:    "a page on another port of this host",
			headers: []string{"Sec-Fetch-Site", "same-site", "Sec-Fetch-Mode", "cors"},
			want:    http.StatusForbidden,
		},
		{
			// "none" is what a user's own action looks like; anything but
			// a navigation that claims it is not one.
			name:    "a request that claims no initiator but is no navigation",
			headers: []string{"Sec-Fetch-Site", "none", "Sec-Fetch-Mode", "cors"},
			want:    http.StatusForbidden,
		},
		{name: "a value of Sec-Fetch-Site that does not exist", headers: []string{"Sec-Fetch-Site", "same-origin-ish"}, want: http.StatusForbidden},
		{name: "another origin in a browser without Sec-Fetch-Site", headers: []string{"Origin", "https://evil.example"}, want: http.StatusForbidden},
		{name: "another port as origin", headers: []string{"Origin", "http://127.0.0.1:9000"}, want: http.StatusForbidden},
		{name: "the own host under another scheme", headers: []string{"Origin", "https://" + testHost}, want: http.StatusForbidden},
		{name: "an opaque origin", headers: []string{"Origin", "null"}, want: http.StatusForbidden},
		{
			// Both headers have to agree; one good one does not excuse the
			// other.
			name:    "a same-origin claim with a foreign origin",
			headers: []string{"Sec-Fetch-Site", "same-origin", "Origin", "https://evil.example"},
			want:    http.StatusForbidden,
		},
		{name: "the Vite dev server outside --dev", headers: []string{"Sec-Fetch-Site", "same-origin", "Origin", "http://localhost:5173"}, want: http.StatusForbidden},

		{name: "the Vite dev server on localhost with --dev", dev: true, headers: []string{"Sec-Fetch-Site", "same-origin", "Origin", "http://localhost:5173"}, want: http.StatusOK},
		{name: "the Vite dev server on 127.0.0.1 with --dev", dev: true, headers: []string{"Sec-Fetch-Site", "same-origin", "Origin", "http://127.0.0.1:5173"}, want: http.StatusOK},
		{name: "another origin with --dev", dev: true, headers: []string{"Origin", "http://localhost:5174"}, want: http.StatusForbidden},
		{name: "a page of another site with --dev", dev: true, headers: []string{"Sec-Fetch-Site", "cross-site", "Origin", "http://localhost:5173"}, want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter(withAPI(stub), func(cfg *routerConfig) { cfg.dev = tt.dev })

			got := serve(router, signedIn(request(http.MethodPost, "/api/v1/jobs", tt.headers...)))

			assert.Equal(t, tt.want, got.Code)
			if tt.want == http.StatusOK {
				assert.Equal(t, []string{"POST /api/v1/jobs"}, stub.seen())
			} else {
				assert.Empty(t, stub.seen())
			}
		})
	}
}

// A check on the methods that change something would leave the reads open,
// and a read shows another page the cluster as the user sees it.
func TestACrossOriginRequestIsRefusedWhateverItsMethod(t *testing.T) {
	t.Parallel()

	methods := []string{
		http.MethodGet, http.MethodHead, http.MethodOptions,
		http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete,
	}
	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter(withAPI(stub))

			got := serve(router, signedIn(request(method, "/api/v1/jobs", "Sec-Fetch-Site", "cross-site")))

			assert.Equal(t, http.StatusForbidden, got.Code)
			assert.Empty(t, stub.seen())
		})
	}
}

// A preflight that is answered without CORS headers is what makes a browser
// drop the request it announces. No header of that family may appear, with
// --dev or without.
func TestNoResponseCarriesCORSHeaders(t *testing.T) {
	t.Parallel()

	for name, change := range map[string]func(*routerConfig){"without --dev": func(*routerConfig) {}, "with --dev": withDev} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			router := testRouter(withAPI(&apiStub{}), change)
			preflight := request(http.MethodOptions, "/api/v1/jobs",
				"Origin", "http://localhost:5173",
				"Sec-Fetch-Site", "same-site",
				"Access-Control-Request-Method", "POST")

			got := serve(router, preflight)

			assert.Equal(t, http.StatusForbidden, got.Code)
			for header := range got.Header() {
				assert.NotContains(t, header, "Access-Control-")
			}
		})
	}
}

// A link on another site, or in a mail, that leads to the interface is an
// ordinary navigation. The pages hold nothing secret; what they show comes
// from the API, which the checks above guard.
func TestThePagesAreServedToANavigationFromAnotherSite(t *testing.T) {
	t.Parallel()

	got := serve(testRouter(), request(http.MethodGet, "/jobs",
		"Sec-Fetch-Site", "cross-site", "Sec-Fetch-Mode", "navigate"))

	assert.Equal(t, http.StatusOK, got.Code)
	assert.Equal(t, indexBody, got.Body.String())
}
