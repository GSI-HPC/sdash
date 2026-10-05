// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/GSI-HPC/sdash/internal/api"
)

// changingMethods returns methods that are no read. The check knows the
// reads and refuses the rest, so that a method nobody thought of, TRACE
// here, is among the refused.
func changingMethods() []string {
	return []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodTrace}
}

// --read-only is a promise that sdash sends nothing that changes a cluster.
// It is kept in front of the API and not in each operation, so the request
// must not get as far as the handler.
func TestReadOnlyRefusesEveryRequestThatCouldChangeSomething(t *testing.T) {
	t.Parallel()

	for _, method := range changingMethods() {
		for _, target := range []string{"/api/v1/jobs/4711", "/api/v1/status", "/api/v2/jobs", "/api/", "/api"} {
			t.Run(method+" "+target, func(t *testing.T) {
				t.Parallel()

				stub := &apiStub{}
				router := testRouter(withAPI(stub), withReadOnly)

				got := serve(router, signedIn(request(method, target)))

				assert.Equal(t, http.StatusForbidden, got.Code)
				body := apiError(t, got)
				assert.Equal(t, api.ErrorCodeReadOnly, body.Code)
				assert.Contains(t, body.Message, "--read-only")
				assert.Equal(t, "no-store", got.Header().Get("Cache-Control"))
				assert.Empty(t, stub.seen(), "the request does not reach the API")
			})
		}
	}
}

// A read changes nothing, and HEAD and OPTIONS ask about an address without
// touching what is behind it.
func TestReadOnlyLetsReadsThrough(t *testing.T) {
	t.Parallel()

	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter(withAPI(stub), withReadOnly)

			got := serve(router, signedIn(request(method, "/api/v1/jobs/4711")))

			assert.Equal(t, http.StatusOK, got.Code)
			assert.Equal(t, []string{method + " /api/v1/jobs/4711"}, stub.seen())
		})
	}
}

func TestWithoutReadOnlyAChangeReachesTheAPI(t *testing.T) {
	t.Parallel()

	for _, method := range changingMethods() {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter(withAPI(stub))

			got := serve(router, signedIn(request(method, "/api/v1/jobs/4711")))

			assert.Equal(t, http.StatusOK, got.Code)
			assert.Equal(t, []string{method + " /api/v1/jobs/4711"}, stub.seen())
		})
	}
}

// The mode is told to a signed-in browser. A request that fails an earlier
// check is answered as in every mode: whoever probes the port learns
// nothing about how this sdash was started.
func TestReadOnlyIsToldOnlyToARequestThatPassedTheOtherChecks(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		request *http.Request
		status  int
		code    api.ErrorCode
	}{
		{
			name:    "no session",
			request: request(http.MethodPost, "/api/v1/jobs"),
			status:  http.StatusUnauthorized,
			code:    api.ErrorCodeNotSignedIn,
		},
		{
			name:    "a page of another site",
			request: signedIn(request(http.MethodPost, "/api/v1/jobs", "Sec-Fetch-Site", "cross-site")),
			status:  http.StatusForbidden,
			code:    api.ErrorCodeCrossOrigin,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}

			got := serve(testRouter(withAPI(stub), withReadOnly), tt.request)

			assert.Equal(t, tt.status, got.Code)
			assert.Equal(t, tt.code, apiError(t, got).Code)
			assert.Empty(t, stub.seen())
		})
	}
}

// The mode is about the API. The pages are files, and answer a method they
// do not have as they always do.
func TestReadOnlyLeavesThePagesAlone(t *testing.T) {
	t.Parallel()

	router := testRouter(withReadOnly)

	page := serve(router, request(http.MethodGet, "/jobs"))
	assert.Equal(t, http.StatusOK, page.Code)
	assert.Equal(t, indexBody, page.Body.String())

	exchange := serve(router, request(http.MethodGet, "/?token="+testToken))
	assert.Equal(t, http.StatusSeeOther, exchange.Code)

	posted := serve(router, request(http.MethodPost, "/jobs"))
	assert.Equal(t, http.StatusMethodNotAllowed, posted.Code)
}

// A refusal is by design, so it is no warning. With -v it is in the log,
// for the user who wonders why a button did nothing.
func TestARefusalInReadOnlyModeIsLoggedButNotAsAWarning(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	router := testRouter(withAPI(&apiStub{}), withReadOnly, withLogger(log.logger()))

	serve(router, signedIn(request(http.MethodDelete, "/api/v1/jobs/4711")))

	assert.Contains(t, log.String(),
		`level=INFO msg="refusing a request that could change something, in read-only mode" method=DELETE path=/api/v1/jobs/4711`)
	assert.NotContains(t, log.String(), "level=WARN")
}
