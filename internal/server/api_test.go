// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/version"
)

// releaseBuild is the provenance a release build carries.
func releaseBuild() version.Info {
	return version.Info{
		Version:   "v1.4.0",
		Commit:    "3f2a9c1d5e7b8a6f4c2d1e0f9a8b7c6d5e4f3a2b",
		Date:      "2026-03-14T09:26:53Z",
		GoVersion: "go1.27.1",
		Platform:  "linux/arm64",
	}
}

// getStatus asks a router that serves the API of cfg for the status, as a
// signed-in browser does.
func getStatus(cfg APIConfig) *httptest.ResponseRecorder {
	router := testRouter(withAPI(NewAPI(cfg)))
	return serve(router, signedIn(request(http.MethodGet, "/api/v1/status")))
}

// members decodes a JSON object into its members, so that a test can tell a
// member that is absent from one that is empty.
func members(t *testing.T, body string) map[string]any {
	t.Helper()
	var object map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &object))
	return object
}

// apiError decodes the body of an answer as the Error of the document and
// fails when it is anything else.
func apiError(t *testing.T, got *httptest.ResponseRecorder) api.Error {
	t.Helper()
	assert.Equal(t, "application/json", got.Header().Get("Content-Type"))
	decoder := json.NewDecoder(got.Body)
	decoder.DisallowUnknownFields()
	var body api.Error
	require.NoError(t, decoder.Decode(&body))
	assert.True(t, body.Code.Valid(), "the code %q is one the document names", body.Code)
	assert.NotEmpty(t, body.Message)
	return body
}

// The status is how the interface, and through it the user, learns which
// sdash is behind the page: the same facts "sdash version" prints.
func TestTheStatusSaysWhichBinaryIsRunning(t *testing.T) {
	t.Parallel()

	got := getStatus(APIConfig{Build: releaseBuild()})

	assert.Equal(t, http.StatusOK, got.Code)
	assert.Equal(t, "application/json", got.Header().Get("Content-Type"))
	assert.JSONEq(t, `{
		"version": "v1.4.0",
		"commit": "3f2a9c1d5e7b8a6f4c2d1e0f9a8b7c6d5e4f3a2b",
		"date": "2026-03-14T09:26:53Z",
		"goVersion": "go1.27.1",
		"platform": "linux/arm64",
		"readOnly": false,
		"clusters": []
	}`, got.Body.String())
}

// The document declares the commit and the date optional. A client that
// finds one of them may rely on it, so what the build does not know is
// absent and not an empty string.
func TestTheStatusLeavesOutWhatTheBuildDoesNotKnow(t *testing.T) {
	t.Parallel()

	t.Run("a build without VCS information", func(t *testing.T) {
		t.Parallel()

		got := getStatus(APIConfig{Build: version.Info{Version: "devel", GoVersion: "go1.27.1", Platform: "linux/amd64"}})

		status := members(t, got.Body.String())
		assert.Equal(t, "devel", status["version"])
		assert.NotContains(t, status, "commit")
		assert.NotContains(t, status, "date")
	})

	// The document declares the date a date-time. A build that injects
	// something else must not make the whole status unreadable to a client
	// that parses it, and must not pass unnoticed either.
	t.Run("a date that is no RFC 3339 time", func(t *testing.T) {
		t.Parallel()

		build := releaseBuild()
		build.Date = "yesterday"
		log := &logBuffer{}

		got := getStatus(APIConfig{Build: build, Logger: log.logger()})

		status := members(t, got.Body.String())
		assert.Equal(t, build.Commit, status["commit"])
		assert.NotContains(t, status, "date")
		assert.Contains(t, log.String(), `level=WARN msg="leaving the build date out of the status" date=yesterday`)
	})
}

func TestTheStatusSaysWhetherSdashRunsReadOnly(t *testing.T) {
	t.Parallel()

	for _, readOnly := range []bool{false, true} {
		got := getStatus(APIConfig{Build: releaseBuild(), ReadOnly: readOnly})

		assert.Equal(t, readOnly, members(t, got.Body.String())["readOnly"])
	}
}

// The interface iterates over the clusters without asking first whether
// there is a list. A nil slice would be sent as null.
func TestTheStatusListsNoClusterAsAnEmptyList(t *testing.T) {
	t.Parallel()

	got := getStatus(APIConfig{Build: releaseBuild()})

	assert.Equal(t, []any{}, members(t, got.Body.String())["clusters"])
}

// The interface reads one shape for everything that goes wrong, whichever
// layer refused: the checks in front of the API, the routing, or nothing
// being mounted at all (api/openapi.yaml, the Error schema).
func TestEveryRefusalUnderAPIIsTheErrorOfTheDocument(t *testing.T) {
	t.Parallel()

	mounted := func() http.Handler { return testRouter(withAPI(NewAPI(APIConfig{Build: releaseBuild()}))) }
	tests := []struct {
		name    string
		router  http.Handler
		request *http.Request
		status  int
		code    api.ErrorCode
	}{
		{
			name:    "no session",
			router:  mounted(),
			request: request(http.MethodGet, "/api/v1/status"),
			status:  http.StatusUnauthorized,
			code:    api.ErrorCodeNotSignedIn,
		},
		{
			name:    "a page of another site",
			router:  mounted(),
			request: signedIn(request(http.MethodGet, "/api/v1/status", "Sec-Fetch-Site", "cross-site")),
			status:  http.StatusForbidden,
			code:    api.ErrorCodeCrossOrigin,
		},
		{
			name:    "an address without an operation",
			router:  mounted(),
			request: signedIn(request(http.MethodGet, "/api/v1/nothing")),
			status:  http.StatusNotFound,
			code:    api.ErrorCodeNotFound,
		},
		{
			name:    "an address below an operation",
			router:  mounted(),
			request: signedIn(request(http.MethodGet, "/api/v1/status/more")),
			status:  http.StatusNotFound,
			code:    api.ErrorCodeNotFound,
		},
		{
			name:    "another version of the API",
			router:  mounted(),
			request: signedIn(request(http.MethodGet, "/api/v2/status")),
			status:  http.StatusNotFound,
			code:    api.ErrorCodeNotFound,
		},
		{
			name:    "a method the operation does not have",
			router:  mounted(),
			request: signedIn(request(http.MethodPost, "/api/v1/status")),
			status:  http.StatusMethodNotAllowed,
			code:    api.ErrorCodeMethodNotAllowed,
		},
		{
			name:    "no API mounted",
			router:  testRouter(),
			request: signedIn(request(http.MethodGet, "/api/v1/status")),
			status:  http.StatusNotFound,
			code:    api.ErrorCodeNotFound,
		},
		{
			// The mode is asked before the routing: what could change
			// something is refused whether or not an operation lives there.
			name:    "a change in read-only mode",
			router:  testRouter(withAPI(NewAPI(APIConfig{Build: releaseBuild(), ReadOnly: true})), withReadOnly),
			request: signedIn(request(http.MethodPost, "/api/v1/status")),
			status:  http.StatusForbidden,
			code:    api.ErrorCodeReadOnly,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := serve(tt.router, tt.request)

			assert.Equal(t, tt.status, got.Code)
			assert.Equal(t, tt.code, apiError(t, got).Code)
			assert.Equal(t, "no-store", got.Header().Get("Cache-Control"))
		})
	}
}

// A 405 without an Allow header leaves the client guessing, and HTTP
// requires the header. chi sets it only in the handler this package
// replaces.
func TestAMethodAnOperationDoesNotHaveIsAnsweredWithTheOnesItHas(t *testing.T) {
	t.Parallel()

	router := testRouter(withAPI(NewAPI(APIConfig{Build: releaseBuild()})))

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodHead} {
		got := serve(router, signedIn(request(method, "/api/v1/status")))

		assert.Equal(t, http.StatusMethodNotAllowed, got.Code, method)
		assert.Equal(t, []string{http.MethodGet}, got.Header().Values("Allow"), method)
	}
}

// failingOperations stands in for an implementation whose every operation
// fails.
type failingOperations struct {
	err error
}

func (f failingOperations) GetStatus(context.Context, api.GetStatusRequestObject) (api.GetStatusResponseObject, error) {
	return nil, f.err
}

// An error from inside sdash may name a path, a host or a command. The log
// is where the user looks for it; the answer says only that there is
// something to look for.
func TestAnOperationThatFailsIsLoggedAndAnsweredWithoutItsCause(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	handler := newAPIHandler(failingOperations{err: errors.New("open /home/user/secret: permission denied")}, log.logger())

	got := serve(testRouter(withAPI(handler)), signedIn(request(http.MethodGet, "/api/v1/status")))

	assert.Equal(t, http.StatusInternalServerError, got.Code)
	body := apiError(t, got)
	assert.Equal(t, api.ErrorCodeInternal, body.Code)
	assert.NotContains(t, body.Message, "secret")
	assert.Contains(t, log.String(), `level=ERROR msg="cannot answer a request to the browser API" method=GET path=/api/v1/status`)
	assert.Contains(t, log.String(), "open /home/user/secret: permission denied")
}

// The base path is written down three times: in the document, here, and in
// the client of the interface. The generated code takes it from none of
// them, so nothing but this test ties the router to the document.
func TestTheAPIIsMountedWhereTheDocumentSaysItIs(t *testing.T) {
	t.Parallel()

	document, err := os.ReadFile("../../api/openapi.yaml")
	require.NoError(t, err)

	_, servers, found := strings.Cut(string(document), "\nservers:\n")
	require.True(t, found, "the document has a servers section")
	servers, _, _ = strings.Cut(servers, "\npaths:\n")
	assert.Contains(t, servers, "\n  - url: "+APIPrefix+"\n")
	assert.Equal(t, 1, strings.Count(servers, "url:"), "the document names one server")
}
