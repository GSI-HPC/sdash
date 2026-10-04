// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

const (
	// indexPage is the document of the single-page app, which every address
	// of the user interface is answered with.
	indexPage = "index.html"
	// assetsDir holds the files the bundler names after a hash of their
	// content. A new build gives changed content a new name, so a browser
	// may keep such a file for good.
	assetsDir = "assets/"

	cacheImmutable = "public, max-age=31536000, immutable"
	// cacheRevalidate makes the browser ask before it reuses a copy. The
	// index names the hashed files of one build, so a stale index would
	// keep a browser on an old interface after an upgrade.
	cacheRevalidate = "no-cache"
)

// notBuiltPage is served in place of the interface by a binary that holds
// none, which is what "go build" without "make build" produces
// (internal/static). It has no script and no inline style, so it passes the
// Content-Security-Policy like any other page.
const notBuiltPage = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>sdash</title>
<h1>The user interface is not part of this build</h1>
<p>This sdash was compiled without its user interface. In a checkout of the
sources, run <code>make build</code>: it builds the interface with npm and
compiles it into <code>bin/sdash</code>.</p>
<p>With <code>--dev</code> the interface is read from <code>web/dist</code>
in the working directory: run <code>npm run build</code> in <code>web/</code>,
or follow the development loop that <code>make dev</code> prints.</p>
`

// static serves the built user interface from files: the build embedded in
// the binary, or with --dev the one on disk.
type static struct {
	files fs.FS
}

// ServeHTTP answers a request for a page or a file of the interface.
//
// A file that exists is served. Any other address is a route of the
// single-page app and gets the index, so that reloading a view or opening a
// link to one works. The exception is assets/: a missing script must fail
// as a 404, not arrive as an HTML page that the browser then refuses to run.
func (s static) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		refuse(w, http.StatusMethodNotAllowed, "the user interface is read with GET")
		return
	}

	// Cleaning resolves every "..", and fs.FS refuses what is left of
	// them, so no address reaches outside files.
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	asset := strings.HasPrefix(name+"/", assetsDir)
	switch {
	case asset && s.isFile(name):
		s.serve(w, r, name, cacheImmutable)
	case asset:
		http.NotFound(w, r)
	case name != "" && s.isFile(name):
		s.serve(w, r, name, cacheRevalidate)
	case s.isFile(indexPage):
		s.serve(w, r, indexPage, cacheRevalidate)
	default:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNotFound)
		// The status is out; a browser that has gone away is all a failed
		// write can mean.
		_, _ = w.Write([]byte(notBuiltPage))
	}
}

// isFile reports whether name is a regular file. A directory is none, so
// its content is never listed.
func (s static) isFile(name string) bool {
	info, err := fs.Stat(s.files, name)
	return err == nil && info.Mode().IsRegular()
}

func (s static) serve(w http.ResponseWriter, r *http.Request, name, cacheControl string) {
	w.Header().Set("Cache-Control", cacheControl)
	http.ServeFileFS(w, r, s.files, name)
}
