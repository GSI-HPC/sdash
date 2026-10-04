// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The index names the hashed files of one build. A browser that reused a
// stale copy would stay on the old interface after an upgrade, so it has to
// ask each time.
func TestTheIndexIsServedAndRevalidatedEachTime(t *testing.T) {
	t.Parallel()

	got := serve(testRouter(), request(http.MethodGet, "/"))

	assert.Equal(t, http.StatusOK, got.Code)
	assert.Equal(t, indexBody, got.Body.String())
	assert.Equal(t, "no-cache", got.Header().Get("Cache-Control"))
	assert.Equal(t, "text/html; charset=utf-8", got.Header().Get("Content-Type"))
}

// The views are routes of the single-page app, not files. Reloading one, or
// opening a link to one, asks the server for an address only the app knows.
func TestAnAddressOfTheAppGetsTheIndex(t *testing.T) {
	t.Parallel()

	for _, target := range []string{
		"/jobs",
		"/jobs/",
		"/nodes/node0001",
		// A step id and a host name contain dots; neither is a file.
		"/jobs/4711.batch",
		"/nodes/node0001.example.org",
		"/jobs?state=running",
	} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()

			got := serve(testRouter(), request(http.MethodGet, target))

			assert.Equal(t, http.StatusOK, got.Code)
			assert.Equal(t, indexBody, got.Body.String())
			assert.Equal(t, "no-cache", got.Header().Get("Cache-Control"))
		})
	}
}

// A file under assets/ is named after a hash of its content, so its content
// never changes under its name and a browser never needs to ask again.
func TestAHashedFileIsCachedForGood(t *testing.T) {
	t.Parallel()

	got := serve(testRouter(), request(http.MethodGet, "/assets/index-BfK3x9Qa.js"))

	assert.Equal(t, http.StatusOK, got.Code)
	assert.Equal(t, scriptBody, got.Body.String())
	assert.Equal(t, "public, max-age=31536000, immutable", got.Header().Get("Cache-Control"))
	// With nosniff a script is run only under a script type.
	assert.Contains(t, got.Header().Get("Content-Type"), "javascript")
}

// After an upgrade an open tab asks for the scripts of the build it was
// loaded from. Answering with the index would hand the browser HTML where
// it expects a script, and it would report a syntax error, not a missing
// file.
func TestAMissingFileUnderAssetsIsNotFound(t *testing.T) {
	t.Parallel()

	for _, target := range []string{"/assets/index-0ldBu1ld.js", "/assets", "/assets/", "/assets/fonts/"} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()

			got := serve(testRouter(), request(http.MethodGet, target))

			assert.Equal(t, http.StatusNotFound, got.Code)
			assert.NotContains(t, got.Body.String(), indexBody)
			// A directory is never listed.
			assert.NotContains(t, got.Body.String(), "index-BfK3x9Qa.js")
			assert.NotEqual(t, "public, max-age=31536000, immutable", got.Header().Get("Cache-Control"))
		})
	}
}

// A file beside the index keeps its name from build to build, so it is not
// cached for good like the hashed ones.
func TestAFileBesideTheIndexIsServedAndRevalidated(t *testing.T) {
	t.Parallel()

	got := serve(testRouter(), request(http.MethodGet, "/favicon.svg"))

	assert.Equal(t, http.StatusOK, got.Code)
	assert.Contains(t, got.Body.String(), "<svg")
	assert.Equal(t, "no-cache", got.Header().Get("Cache-Control"))
	assert.Equal(t, "image/svg+xml", got.Header().Get("Content-Type"))
}

// "go build" without "make build" gives a binary that holds no interface.
// It must say so and say what to do, on every address a user may open, and
// with a status a smoke test of a release build cannot take for success.
func TestABinaryWithoutTheInterfaceSaysHowToBuildIt(t *testing.T) {
	t.Parallel()

	router := testRouter(withFiles(unbuiltFiles()))
	for _, target := range []string{"/", "/jobs"} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()

			got := serve(router, request(http.MethodGet, target))

			assert.Equal(t, http.StatusNotFound, got.Code)
			assert.Contains(t, got.Body.String(), "not part of this build")
			assert.Contains(t, got.Body.String(), "make build")
			assert.Equal(t, "text/html; charset=utf-8", got.Header().Get("Content-Type"))
			assert.Equal(t, "no-store", got.Header().Get("Cache-Control"))
			// The page has to pass the policy it is served under.
			assert.NotContains(t, got.Body.String(), "<script")
			assert.NotContains(t, got.Body.String(), "style=")
		})
	}
}

// With --dev the interface is read from disk, and "npm run build" may
// finish after sdash has started.
func TestAnInterfaceBuiltLaterIsServedWithoutARestart(t *testing.T) {
	t.Parallel()

	files := unbuiltFiles()
	router := testRouter(withFiles(files))
	require.Equal(t, http.StatusNotFound, serve(router, request(http.MethodGet, "/")).Code)

	files["index.html"] = &fstest.MapFile{Data: []byte(indexBody)}

	got := serve(router, request(http.MethodGet, "/"))
	assert.Equal(t, http.StatusOK, got.Code)
	assert.Equal(t, indexBody, got.Body.String())
}

func TestTheInterfaceIsReadWithGETAndHEADOnly(t *testing.T) {
	t.Parallel()

	router := testRouter()

	head := serve(router, request(http.MethodHead, "/"))
	assert.Equal(t, http.StatusOK, head.Code)
	assert.Empty(t, head.Body.String())

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions} {
		got := serve(router, request(method, "/"))
		assert.Equal(t, http.StatusMethodNotAllowed, got.Code, method)
		assert.Equal(t, "GET, HEAD", got.Header().Get("Allow"), method)
	}
}

// With --dev the file system is a directory on disk, where ".." leads
// somewhere. No address may be answered with a file from outside it.
func TestNoAddressReachesOutsideTheInterface(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	dist := filepath.Join(root, "web", "dist")
	require.NoError(t, os.MkdirAll(dist, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dist, "index.html"), []byte(indexBody), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(root, "secret.txt"), []byte("TOP SECRET"), 0o644))
	handler := static{files: os.DirFS(dist)}

	for _, target := range []string{
		"/../../secret.txt",
		"/assets/../../../secret.txt",
		"/%2e%2e/%2e%2e/secret.txt",
		"/..%2f..%2fsecret.txt",
	} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()

			got := serve(handler, request(http.MethodGet, target))

			assert.NotContains(t, got.Body.String(), "TOP SECRET")
		})
	}
}
