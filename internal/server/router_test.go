// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

// This is the seam the generated handler of api/openapi.yaml is mounted at
// (doc/adr/0011-openapi-first-browser-api.md): whatever is handed in serves
// /api/v1/, for every method, and only behind the session.
func TestTheAPIHandlerIsMountedUnderItsPrefix(t *testing.T) {
	t.Parallel()

	methods := []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete}
	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}

			got := serve(testRouter(withAPI(stub)), signedIn(request(method, "/api/v1/status")))

			assert.Equal(t, http.StatusOK, got.Code)
			assert.JSONEq(t, `{"stub":true}`, got.Body.String())
			assert.Equal(t, []string{method + " /api/v1/status"}, stub.seen())
		})
	}
}

// The generated code registers its operations under the base path of the
// OpenAPI document, so it has to see the address as the browser sent it.
// Both kinds of generated router are tried: one of the standard library and
// one of chi, which inside another chi router would otherwise be handed
// what is left of the path.
func TestTheAPIHandlerSeesTheFullPath(t *testing.T) {
	t.Parallel()

	answer := func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(r.URL.Path))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+APIPrefix+"/status", answer)
	sub := chi.NewRouter()
	sub.Get(APIPrefix+"/status", answer)

	for name, api := range map[string]http.Handler{"a ServeMux": mux, "a chi router": sub} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			router := testRouter(withAPI(api))

			got := serve(router, signedIn(request(http.MethodGet, "/api/v1/status")))
			assert.Equal(t, http.StatusOK, got.Code)
			assert.Equal(t, "/api/v1/status", got.Body.String())

			missing := serve(router, signedIn(request(http.MethodGet, "/api/v1/nothing")))
			assert.Equal(t, http.StatusNotFound, missing.Code)
			assert.NotContains(t, missing.Body.String(), indexBody)
		})
	}
}

// An address under /api/ that nothing serves must fail as one. Falling
// through to the interface would answer a fetch with the index page and a
// 200, which a client then tries to read as JSON.
func TestAnAddressUnderAPIThatNothingServesIsNotFound(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		mounted bool
		target  string
	}{
		{name: "nothing is mounted", target: "/api/v1/status"},
		{name: "nothing is mounted, the root", target: "/api/"},
		{name: "nothing is mounted, the root without a slash", target: "/api"},
		{name: "the root without a slash", mounted: true, target: "/api"},
		{name: "another version than the mounted one", mounted: true, target: "/api/v2/status"},
		{name: "the prefix without a slash", mounted: true, target: "/api/v1"},
		{name: "a name that only starts like the prefix", mounted: true, target: "/api/v10/status"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter()
			if tt.mounted {
				router = testRouter(withAPI(stub))
			}

			got := serve(router, signedIn(request(http.MethodGet, tt.target)))

			assert.Equal(t, http.StatusNotFound, got.Code)
			assert.NotContains(t, got.Body.String(), indexBody)
			assert.Empty(t, stub.seen())
		})
	}
}

// Without a session every address under /api/ answers alike, whether an
// operation lives there or not, so a local process that probes the port
// learns nothing about what this version serves.
func TestWithoutASessionEveryAddressUnderAPIAnswersAlike(t *testing.T) {
	t.Parallel()

	for name, router := range map[string]http.Handler{
		"nothing is mounted": testRouter(),
		"an API is mounted":  testRouter(withAPI(&apiStub{})),
	} {
		for _, target := range []string{"/api", "/api/", "/api/v1/status", "/api/v1/nothing", "/api/v2/status"} {
			t.Run(name+" "+target, func(t *testing.T) {
				t.Parallel()

				got := serve(router, request(http.MethodGet, target))

				assert.Equal(t, http.StatusUnauthorized, got.Code)
			})
		}
	}
}

// -vv is how a user finds out what the browser asked for. The line names
// the path and the answer.
func TestEveryRequestIsLoggedAtDebugLevel(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	router := testRouter(withAPI(&apiStub{}), withLogger(log.logger()))

	serve(router, request(http.MethodGet, "/assets/index-BfK3x9Qa.js"))
	serve(router, signedIn(request(http.MethodPost, "/api/v1/jobs")))
	serve(router, request(http.MethodGet, "/api/v1/jobs"))

	assert.Contains(t, log.String(), "msg=request method=GET path=/assets/index-BfK3x9Qa.js status=200")
	assert.Contains(t, log.String(), "msg=request method=POST path=/api/v1/jobs status=200")
	assert.Contains(t, log.String(), "msg=request method=GET path=/api/v1/jobs status=401")
}
