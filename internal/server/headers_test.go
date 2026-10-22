// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/GSI-HPC/go-clikit/localweb"
)

// The headers protect a response wherever it comes from. A refusal written
// before they are set would be the one response without them, and a hostile
// request is exactly what gets refused.
func TestEveryResponseCarriesTheSecurityHeaders(t *testing.T) {
	t.Parallel()

	stub := &apiStub{}
	router := testRouter(withAPI(stub))
	tests := []struct {
		name    string
		request *http.Request
		status  int
	}{
		{name: "a page", request: signedIn(request(http.MethodGet, "/")), status: http.StatusOK},
		{name: "a file of the interface", request: signedIn(request(http.MethodGet, "/assets/index-BfK3x9Qa.js")), status: http.StatusOK},
		{name: "an answer of the API", request: signedIn(request(http.MethodGet, "/api/v1/status")), status: http.StatusOK},
		{name: "a request without a session", request: request(http.MethodGet, "/api/v1/status"), status: http.StatusUnauthorized},
		{
			name:    "a request from another origin",
			request: request(http.MethodGet, "/api/v1/status", "Sec-Fetch-Site", "cross-site"),
			status:  http.StatusForbidden,
		},
		{
			name: "a request for another host",
			request: func() *http.Request {
				r := request(http.MethodGet, "/")
				r.Host = "rebind.example:7374"
				return r
			}(),
			status: http.StatusMisdirectedRequest,
		},
		{name: "a method the interface does not take", request: signedIn(request(http.MethodPost, "/")), status: http.StatusMethodNotAllowed},
		{name: "a token exchange", request: request(http.MethodGet, "/?token="+testToken), status: http.StatusSeeOther},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := serve(router, tt.request)

			assert.Equal(t, tt.status, got.Code)
			assert.Equal(t, localweb.ContentSecurityPolicy, got.Header().Get("Content-Security-Policy"))
			assert.Equal(t, "nosniff", got.Header().Get("X-Content-Type-Options"))
			assert.Equal(t, "same-origin", got.Header().Get("Referrer-Policy"))
			assert.Equal(t, "DENY", got.Header().Get("X-Frame-Options"))
			assert.Equal(t, "same-origin", got.Header().Get("Cross-Origin-Opener-Policy"))
			assert.Equal(t, "same-origin", got.Header().Get("Cross-Origin-Resource-Policy"))
		})
	}
}

// The policy is a decision (doc/adr/0012-local-listener-security.md), spelt
// out here a second time so that loosening it takes a change to this test
// as well as to localweb. It is localweb's default, stricter than the
// policy sdash sent before: default-src is 'none', so a worker, a frame or a
// media element of the interface would have to be allowed by a directive of
// its own.
func TestThePolicyAllowsTheOwnOriginAndNothingElse(t *testing.T) {
	t.Parallel()

	assert.Equal(t,
		"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "+
			"font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; "+
			"base-uri 'none'; frame-ancestors 'none'",
		localweb.ContentSecurityPolicy)
}

// What the API answers shows the cluster as the signed-in user sees it; a
// copy in a cache would outlive the session. A refusal is not kept either:
// the same address answers differently once the browser is signed in.
func TestNothingUnderTheAPIIsCached(t *testing.T) {
	t.Parallel()

	router := testRouter(withAPI(&apiStub{}))
	tests := []struct {
		name    string
		request *http.Request
	}{
		{name: "an answer", request: signedIn(request(http.MethodGet, "/api/v1/status"))},
		{name: "an address that does not exist", request: signedIn(request(http.MethodGet, "/api/v2/status"))},
		{name: "a request without a session", request: request(http.MethodGet, "/api/v1/status")},
		{name: "a request from another origin", request: request(http.MethodGet, "/api/v1/status", "Sec-Fetch-Site", "cross-site")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := serve(router, tt.request)

			assert.Equal(t, "no-store", got.Header().Get("Cache-Control"))
		})
	}
}
