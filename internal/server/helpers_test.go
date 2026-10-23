// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/go-clikit/localweb"
	"github.com/GSI-HPC/go-clikit/localweb/session"
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

func testAddr() netip.AddrPort {
	return netip.AddrPortFrom(netip.MustParseAddr("127.0.0.1"), testPort)
}

// answering is what a router answers to when its listeners are bound to
// addrs, or to the socket when there is none.
func answering(addrs ...netip.AddrPort) func(string) bool {
	return (&localweb.Bound{Addrs: addrs}).Answers
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

// testRouter builds the handler tree of a listener on testHost, and on that
// address alone, that serves a built interface and mounts no API; each
// change adjusts that.
func testRouter(changes ...func(*routerConfig)) http.Handler {
	cfg := routerConfig{
		answers:  answering(testAddr()),
		sessions: testSessions(),
		files:    builtFiles(),
		logger:   discardLogger(),
	}
	for _, change := range changes {
		change(&cfg)
	}
	return newRouter(cfg)
}

func withDev(cfg *routerConfig) { cfg.dev = true }

func withReadOnly(cfg *routerConfig) { cfg.readOnly = true }

// onBothAddresses is a listener that holds testPort on 127.0.0.1 and on
// ::1, as the name localhost has it bound.
func onBothAddresses(cfg *routerConfig) {
	cfg.answers = answering(testAddr(), netip.AddrPortFrom(netip.IPv6Loopback(), testPort))
}

// onSocket is a listener on a unix socket, which is bound to no address.
func onSocket(cfg *routerConfig) {
	cfg.answers = (&localweb.Bound{Socket: "/run/user/1000/sdash/sdash.sock"}).Answers
}

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
// value in turn. A request that may change something carries the Origin of
// the page it comes from, as a browser sends it, unless the headers give
// another or withoutOrigin removes it.
func request(method, target string, headers ...string) *http.Request {
	r := httptest.NewRequest(method, "http://"+testHost+target, nil)
	if !localweb.SafeMethod(method) {
		r.Header.Set("Origin", "http://"+testHost)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	return r
}

// withoutOrigin removes the Origin header that request adds, as a client
// that is no browser does not send one.
func withoutOrigin(r *http.Request) *http.Request {
	r.Header.Del("Origin")
	return r
}

// sharedSessions are the sessions every router under test is put together
// with, so that a request can be signed in without a reference to the
// router that serves it.
var sharedSessions = sync.OnceValue(func() *session.Manager {
	sessions, err := newSessions(testToken, discardLogger())
	if err != nil {
		panic(err)
	}
	return sessions
})

func testSessions() *session.Manager { return sharedSessions() }

// signIn trades the launch token for a session of the shared sessions, as
// the first navigation of a browser does, and returns the cookie and the CSRF
// token of the session. It signs in under the Host of the request, which
// names the cookie.
func signIn(host string) (*http.Cookie, string) {
	return signInOn(testSessions(), host)
}

// signInOn is signIn for the sessions of a router of the test's own. A
// router that does not let the exchange through is a mistake of the test, so
// it panics rather than fail a test it has no handle on.
func signInOn(sessions *session.Manager, host string) (*http.Cookie, string) {
	var csrf string
	exchanged := sessions.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		csrf = session.CSRF(r.Context())
	}))
	first := request(http.MethodGet, "/?"+session.TokenParam+"="+testToken)
	first.Host = host
	got := serve(exchanged, first)
	cookies := got.Result().Cookies()
	if got.Code != http.StatusSeeOther || len(cookies) != 1 {
		panic(fmt.Sprintf("the launch token did not sign in: %d, %d cookies", got.Code, len(cookies)))
	}

	// The session tells its token to a request that has the cookie.
	second := request(http.MethodGet, "/")
	second.Host = host
	second.AddCookie(cookies[0])
	if serve(exchanged, second); csrf == "" {
		panic("the session told no CSRF token")
	}
	return cookies[0], csrf
}

// signedIn gives a request the session of a browser that has signed in: its
// cookie and, for a request that may change something, the CSRF token that
// the page's script sends.
func signedIn(r *http.Request) *http.Request {
	return signedInOn(testSessions(), r)
}

// signedInOn is signedIn for the sessions of a router of the test's own.
func signedInOn(sessions *session.Manager, r *http.Request) *http.Request {
	cookie, csrf := signInOn(sessions, r.Host)
	r.AddCookie(cookie)
	if !localweb.SafeMethod(r.Method) {
		r.Header.Set(csrfHeader, csrf)
	}
	return r
}

// loggedRouter is a router whose log, and its sessions', goes to log, and
// the function that signs a request in to it.
func loggedRouter(log *logBuffer, changes ...func(*routerConfig)) (http.Handler, func(*http.Request) *http.Request) {
	sessions, err := newSessions(testToken, log.logger())
	if err != nil {
		panic(err)
	}
	changes = append(changes, withLogger(log.logger()), func(cfg *routerConfig) { cfg.sessions = sessions })
	return testRouter(changes...), func(r *http.Request) *http.Request { return signedInOn(sessions, r) }
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

// systemBind binds on the machine the test runs on.
func systemBind(ctx context.Context, network, address string) (net.Listener, error) {
	var lc net.ListenConfig
	return lc.Listen(ctx, network, address)
}
