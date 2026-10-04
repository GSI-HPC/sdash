// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"bytes"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/stretchr/testify/require"
)

const (
	// testPort is the port the routers under test believe they are bound
	// to, and testHost the Host header a browser sends to it.
	testPort = 7374
	testHost = "127.0.0.1:7374"
	// testToken stands in for the secret of a launch.
	testToken = "LAUNCHTOKENLAUNCHTOKENLAUNCH"

	indexBody  = "<!doctype html><title>sdash</title><div id=\"root\"></div>"
	scriptBody = "console.log('sdash')"
)

func testAddr() *net.TCPAddr {
	return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: testPort}
}

// builtFiles is an interface as the bundler leaves it: the index, files
// named after their content under assets/, and a file beside the index.
func builtFiles() fstest.MapFS {
	return fstest.MapFS{
		"index.html":                {Data: []byte(indexBody)},
		"assets/index-BfK3x9Qa.js":  {Data: []byte(scriptBody)},
		"assets/index-D4kd82Lm.css": {Data: []byte("body{margin:0}")},
		"favicon.svg":               {Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`)},
	}
}

// unbuiltFiles is what a binary compiled without "make build" embeds.
func unbuiltFiles() fstest.MapFS {
	return fstest.MapFS{"placeholder.txt": {Data: []byte("placeholder")}}
}

func discardLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}

// testRouter builds the handler tree of a listener on testHost that serves
// a built interface and mounts no API; each change adjusts that.
func testRouter(changes ...func(*routerConfig)) http.Handler {
	cfg := routerConfig{
		addr:   testAddr(),
		token:  testToken,
		files:  builtFiles(),
		logger: discardLogger(),
	}
	for _, change := range changes {
		change(&cfg)
	}
	return newRouter(cfg)
}

func withDev(cfg *routerConfig) { cfg.dev = true }

func withAPI(api http.Handler) func(*routerConfig) {
	return func(cfg *routerConfig) { cfg.api = api }
}

func withFiles(files fstest.MapFS) func(*routerConfig) {
	return func(cfg *routerConfig) { cfg.files = files }
}

func withLogger(logger *slog.Logger) func(*routerConfig) {
	return func(cfg *routerConfig) { cfg.logger = logger }
}

// request builds a request to testHost, with headers given as name and
// value in turn.
func request(method, target string, headers ...string) *http.Request {
	r := httptest.NewRequest(method, "http://"+testHost+target, nil)
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	return r
}

// signedIn adds the session cookie of the launch to a request.
func signedIn(r *http.Request) *http.Request {
	r.AddCookie(&http.Cookie{Name: cookieName(testPort), Value: testToken})
	return r
}

// serve answers a request with a handler and returns what it wrote.
func serve(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	h.ServeHTTP(recorder, r)
	return recorder
}

// apiStub stands in for the generated handler of the browser API. It
// answers every request with 200 and remembers the paths it was asked for.
type apiStub struct {
	mu    sync.Mutex
	paths []string
}

func (s *apiStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.paths = append(s.paths, r.Method+" "+r.URL.Path)
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"stub":true}`))
}

func (s *apiStub) seen() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.paths...)
}

// logBuffer collects a log that the server's goroutines write while the
// test reads it.
type logBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *logBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *logBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// logger returns a logger that writes everything, debug included, to b.
func (b *logBuffer) logger() *slog.Logger {
	return slog.New(slog.NewTextHandler(b, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

// await receives from ch. When nothing arrives it fails the test, where a
// bare receive would hang until the test binary's timeout and say nothing
// about which step never happened.
func await[T any](t *testing.T, ch <-chan T, what string) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(30 * time.Second):
		require.FailNow(t, "timed out waiting for "+what)
	}
	var zero T
	return zero
}
