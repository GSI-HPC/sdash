// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/go-clikit/localweb/localwebtest"
	"github.com/GSI-HPC/go-clikit/localweb/session"

	"github.com/GSI-HPC/sdash/internal/api"
)

// What the session does is localweb/session's to test: the cookie's
// attributes, the redirect, the comparison of secrets and the CSRF token. These
// tests hold what sdash adds to it: the name of the cookie and of the header,
// the words of a refusal and the Error that carries it under /api/, and the
// operation that gives the page its CSRF token.

// The token signs a browser in once; from then on the cookie does, and the
// token leaves the address bar, where a screen share, a screenshot or a
// copied link would carry it on.
func TestTheFirstNavigationTradesTheTokenForTheSessionCookie(t *testing.T) {
	t.Parallel()

	got := serve(testRouter(), request(http.MethodGet, "/?token="+testToken))

	require.Equal(t, http.StatusSeeOther, got.Code)
	assert.Equal(t, "/", got.Header().Get("Location"))
	assert.Equal(t, "no-store", got.Header().Get("Cache-Control"))
	assert.NotContains(t, got.Body.String(), testToken)

	cookie, err := http.ParseSetCookie(got.Header().Get("Set-Cookie"))
	require.NoError(t, err)
	assert.Equal(t, "sdash_session_7374", cookie.Name)
	// The session has an identifier of its own: the cookie never holds the
	// secret that the address printed.
	assert.NotEmpty(t, cookie.Value)
	assert.NotEqual(t, testToken, cookie.Value)
	assert.Equal(t, "/", cookie.Path)
	// No script may read it, and no request another site causes may carry
	// it.
	assert.True(t, cookie.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, cookie.SameSite)
	// A Secure cookie is not accepted over plain HTTP by every browser; a
	// lifetime would let it outlast the browser session.
	assert.False(t, cookie.Secure)
	assert.Zero(t, cookie.MaxAge)
	assert.True(t, cookie.Expires.IsZero())
	assert.Empty(t, cookie.Domain)
}

// The link may lead to a view, as one copied from a second window does; the
// user has to arrive there, with whatever else the address said.
func TestTheExchangeKeepsThePathAndTheRestOfTheQuery(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		target string
		want   string
	}{
		{name: "a view", target: "/jobs/1234?token=" + testToken, want: "/jobs/1234"},
		{name: "a view with a filter", target: "/jobs?state=running&token=" + testToken + "&user=alice", want: "/jobs?state=running&user=alice"},
		{name: "a trailing slash", target: "/nodes/?token=" + testToken, want: "/nodes/"},
		{
			// "//host/" in a Location header names another host. The token
			// is valid here, so this is not an attack that works today; it
			// is a redirect that must never leave the server.
			name:   "a path that would read as another host",
			target: "//evil.example/?token=" + testToken,
			want:   "/evil.example/",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := serve(testRouter(), request(http.MethodGet, tt.target))

			require.Equal(t, http.StatusSeeOther, got.Code)
			assert.Equal(t, tt.want, got.Header().Get("Location"))
		})
	}
}

// A bookmark of an earlier launch, or a guess, signs nobody in, and says
// why and what to do instead of showing an interface that then fails on
// every request.
func TestATokenThatIsNotThisLaunchsIsRefusedWithTheWayIn(t *testing.T) {
	t.Parallel()

	for name, token := range map[string]string{
		"another launch's": "EARLIERLAUNCHEARLIERLAUNCH",
		"a prefix":         testToken[:len(testToken)-1],
		"an empty one":     "",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got := serve(testRouter(), request(http.MethodGet, "/?token="+token))

			assert.Equal(t, http.StatusForbidden, got.Code)
			assert.Empty(t, got.Header().Get("Set-Cookie"))
			assert.Contains(t, got.Body.String(), "old or wrong token")
			assert.Contains(t, got.Body.String(), openTheAddress)
		})
	}
}

// A browser that has not been signed in is not served the interface, and is
// told how to get in. The page it would get is of no use without the API.
func TestAPageIsRefusedToABrowserThatIsNotSignedInAndSaysHowToGetIn(t *testing.T) {
	t.Parallel()

	for _, target := range []string{"/", "/jobs", "/assets/index-BfK3x9Qa.js", "/favicon.svg"} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()

			got := serve(testRouter(), request(http.MethodGet, target))

			assert.Equal(t, http.StatusForbidden, got.Code)
			assert.Equal(t, "text/plain; charset=utf-8", got.Header().Get("Content-Type"))
			assert.Contains(t, got.Body.String(), "not signed in")
			assert.Contains(t, got.Body.String(), openTheAddress)
			assert.NotContains(t, got.Body.String(), "<div")
		})
	}
}

// Any local process and any page can send a request to the port. The cookie
// is what only the user's signed-in browser has.
func TestTheAPIServesOnlyTheSessionOfThisLaunch(t *testing.T) {
	t.Parallel()

	signedInCookie, _ := signIn(testHost)
	tests := []struct {
		name   string
		cookie *http.Cookie
		want   int
	}{
		{name: "a session of this launch", cookie: signedInCookie, want: http.StatusOK},
		{name: "no cookie", want: http.StatusUnauthorized},
		{name: "a session that was never made", cookie: &http.Cookie{Name: "sdash_session_7374", Value: "EARLIERLAUNCHEARLIERLAUNCH"}, want: http.StatusUnauthorized},
		{name: "the launch token in place of a session", cookie: &http.Cookie{Name: "sdash_session_7374", Value: testToken}, want: http.StatusUnauthorized},
		{name: "an empty cookie", cookie: &http.Cookie{Name: "sdash_session_7374", Value: ""}, want: http.StatusUnauthorized},
		{
			// Cookies are kept per host name, whatever the port: the
			// cookie of a second sdash arrives here as well, under its own
			// name.
			name:   "a session under another port's name",
			cookie: &http.Cookie{Name: "sdash_session_7375", Value: signedInCookie.Value},
			want:   http.StatusUnauthorized,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			r := request(http.MethodGet, "/api/v1/status")
			if tt.cookie != nil {
				r.AddCookie(tt.cookie)
			}

			got := serve(testRouter(withAPI(stub)), r)

			assert.Equal(t, tt.want, got.Code)
			if tt.want == http.StatusOK {
				assert.Equal(t, []string{"GET /api/v1/status"}, stub.seen())
				return
			}
			assert.Empty(t, stub.seen())
			body := apiError(t, got)
			assert.Equal(t, api.ErrorCodeNotSignedIn, body.Code)
			assert.NotContains(t, got.Body.String(), "stub")
		})
	}
}

// The session is checked before the router looks at the address, so a
// request without one learns nothing about which addresses exist.
func TestARequestWithoutASessionLearnsNothingAboutTheAddresses(t *testing.T) {
	t.Parallel()

	router := testRouter(withAPI(&apiStub{}))

	known := serve(router, request(http.MethodGet, "/api/v1/status"))
	unknown := serve(router, request(http.MethodGet, "/api/v2/nothing"))
	bare := serve(router, request(http.MethodGet, "/api"))

	for _, got := range []*httptest.ResponseRecorder{known, unknown, bare} {
		assert.Equal(t, http.StatusUnauthorized, got.Code)
		assert.Equal(t, api.ErrorCodeNotSignedIn, apiError(t, got).Code)
	}
}

// Two sdash processes on one machine share the browser's cookies for
// 127.0.0.1; a name without the port would have each sign the other out.
// The port in the name is the one the browser sent the request to, which it
// states in the Host header. A listener on a unix socket has no port of its
// own to go by: the browser names the port of whatever forward the user put
// in front of the socket. One rule serves both kinds of listener.
func TestTheCookieIsNamedAfterThePortInTheHostHeader(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		change func(*routerConfig)
		host   string
		want   string
	}{
		{name: "the bound address", change: func(*routerConfig) {}, host: "127.0.0.1:7374", want: "sdash_session_7374"},
		{name: "localhost on both addresses", change: onBothAddresses, host: "localhost:7374", want: "sdash_session_7374"},
		{name: "the IPv6 address on both addresses", change: onBothAddresses, host: "[::1]:7374", want: "sdash_session_7374"},
		{name: "a socket behind a forward from the suggested port", change: onSocket, host: "127.0.0.1:7374", want: "sdash_session_7374"},
		{name: "a socket behind a forward from another port", change: onSocket, host: "127.0.0.1:18080", want: "sdash_session_18080"},
		{name: "a socket behind a forward that is named localhost", change: onSocket, host: "localhost:8000", want: "sdash_session_8000"},
		{name: "a socket behind a forward over IPv6", change: onSocket, host: "[::1]:8000", want: "sdash_session_8000"},
		// A browser leaves the default port of HTTP out of the header.
		{name: "a socket behind a forward from port 80", change: onSocket, host: "localhost", want: "sdash_session_80"},
		{name: "a socket behind a forward from port 80 over IPv6", change: onSocket, host: "[::1]", want: "sdash_session_80"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			router := testRouter(withAPI(stub), tt.change)
			to := func(r *http.Request) *http.Request {
				r.Host = tt.host
				return r
			}

			exchange := serve(router, to(request(http.MethodGet, "/?token="+testToken)))

			require.Equal(t, http.StatusSeeOther, exchange.Code)
			cookie, err := http.ParseSetCookie(exchange.Header().Get("Set-Cookie"))
			require.NoError(t, err)
			assert.Equal(t, tt.want, cookie.Name)

			// The cookie the exchange gave is the one the API then asks
			// for, under the same Host.
			withCookie := to(request(http.MethodGet, "/api/v1/status"))
			withCookie.AddCookie(cookie)
			assert.Equal(t, http.StatusOK, serve(router, withCookie).Code)
			assert.Equal(t, []string{"GET /api/v1/status"}, stub.seen())
		})
	}
}

// Two forwards to one socket, or a forward and another sdash on a port, sit
// behind one host name in the browser, which sends the cookies of both to
// each. Only the cookie of the port a request names counts.
func TestTheCookieOfAnotherPortDoesNotSignInBehindAForward(t *testing.T) {
	t.Parallel()

	stub := &apiStub{}
	router := testRouter(withAPI(stub), onSocket)
	cookie, _ := signIn("127.0.0.1:7374")
	r := request(http.MethodGet, "/api/v1/status")
	r.Host = "127.0.0.1:18080"
	r.AddCookie(cookie)

	assert.Equal(t, http.StatusUnauthorized, serve(router, r).Code)
	assert.Empty(t, stub.seen())
}

// A request that could change something must name the CSRF token of its
// session, which a page of another site cannot read. The session sees to it
// before any handler runs, so an operation added later is covered without
// anybody having to remember.
func TestARequestThatCouldChangeSomethingNeedsTheTokenOfItsSession(t *testing.T) {
	t.Parallel()

	cookie, csrf := signIn(testHost)
	_, otherCSRF := signIn(testHost)
	tests := []struct {
		name   string
		header string
		want   int
		code   api.ErrorCode
	}{
		{name: "the token of the session", header: csrf, want: http.StatusOK},
		{name: "no token", want: http.StatusForbidden, code: api.ErrorCodeCsrf},
		{name: "a wrong token", header: "WRONGWRONGWRONG", want: http.StatusForbidden, code: api.ErrorCodeCsrf},
		{name: "the token of another session", header: otherCSRF, want: http.StatusForbidden, code: api.ErrorCodeCsrf},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			r := request(http.MethodPost, "/api/v1/jobs")
			r.AddCookie(cookie)
			if tt.header != "" {
				r.Header.Set(csrfHeader, tt.header)
			}

			got := serve(testRouter(withAPI(stub)), r)

			assert.Equal(t, tt.want, got.Code)
			if tt.want == http.StatusOK {
				assert.Equal(t, []string{"POST /api/v1/jobs"}, stub.seen())
				return
			}
			assert.Empty(t, stub.seen())
			assert.Equal(t, tt.code, apiError(t, got).Code)
		})
	}
}

// A read changes nothing, so it needs no token: the page asks for the token
// with one.
func TestAReadNeedsNoToken(t *testing.T) {
	t.Parallel()

	cookie, _ := signIn(testHost)
	r := request(http.MethodGet, "/api/v1/status")
	r.AddCookie(cookie)

	assert.Equal(t, http.StatusOK, serve(testRouter(withAPI(&apiStub{})), r).Code)
}

// What the session refuses in a form is answered as the Error of the
// document, with the status the session gave.
func TestAFormTheSessionCannotTakeIsABadRequestOfTheAPI(t *testing.T) {
	t.Parallel()

	cookie, csrf := signIn(testHost)
	tests := []struct {
		name string
		body string
		want int
	}{
		{name: "a form that is larger than the session takes", body: "a=" + strings.Repeat("x", 65<<10), want: http.StatusRequestEntityTooLarge},
		{name: "a form that is malformed", body: "a=%zz", want: http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			r := request(http.MethodPost, "/api/v1/jobs")
			r.AddCookie(cookie)
			r.Header.Set(csrfHeader, csrf)
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			r.Body = io.NopCloser(strings.NewReader(tt.body))

			got := serve(testRouter(withAPI(stub)), r)

			assert.Equal(t, tt.want, got.Code)
			assert.Empty(t, stub.seen())
			assert.Equal(t, api.ErrorCodeBadRequest, apiError(t, got).Code)
		})
	}
}

// A log is copied into issues and read by more people than a terminal is.
func TestTheLogNeverHoldsTheToken(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	router, signedIn := loggedRouter(log, withAPI(&apiStub{}))

	serve(router, request(http.MethodGet, "/jobs?token="+testToken+"x"))
	serve(router, request(http.MethodGet, "/?token="+testToken+"x"))
	serve(router, signedIn(request(http.MethodGet, "/api/v1/status?token="+testToken)))
	serve(router, request(http.MethodGet, "/api/v1/status?token="+testToken))

	assert.Contains(t, log.String(), "path=/jobs")
	assert.NotContains(t, log.String(), testToken)
}

// Without a session, a request is refused as a matter of course: a tab left
// open across a restart asks again and again. A token that is wrong is not.
func TestOnlyAWrongTokenIsAWarning(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	router, _ := loggedRouter(log, withAPI(&apiStub{}))

	serve(router, request(http.MethodGet, "/api/v1/status"))
	assert.NotContains(t, log.String(), "level=WARN")
	assert.Contains(t, log.String(), "level=DEBUG msg=\"refusing a request without a valid session\"")

	serve(router, request(http.MethodGet, "/?token=wrong"))
	assert.Contains(t, log.String(), "level=WARN msg=\"refusing a request without a valid session\"")
}

// The page reads its CSRF token with the operation getSession and sends it
// back in the header on the requests that could change something. This runs
// the whole way over a real connection, as a browser that signed in would,
// with the client of localwebtest.
func TestThePageReadsItsTokenAndSendsItBack(t *testing.T) {
	t.Parallel()

	for _, readOnly := range []bool{false, true} {
		t.Run(map[bool]string{false: "read-write", true: "read-only"}[readOnly], func(t *testing.T) {
			t.Parallel()

			srv := start(t, Config{API: NewAPI(APIConfig{ReadOnly: readOnly}), ReadOnly: readOnly})
			printed, err := url.Parse(srv.URL())
			require.NoError(t, err)
			base := "http://" + printed.Host
			page := localwebtest.Login(t, base, printed.Query().Get(session.TokenParam))

			answer := page.Get(t, APIPrefix+"/session")
			defer func() { _ = answer.Body.Close() }()
			require.Equal(t, http.StatusOK, answer.StatusCode)
			var got api.Session
			require.NoError(t, decode(answer.Body, &got))
			require.NotEmpty(t, got.CsrfToken)
			assert.Equal(t, "no-store", answer.Header.Get("Cache-Control"))

			// Without the token the session refuses the change, before the
			// mode or the API is asked.
			refused := page.PostForm(t, APIPrefix+"/status", nil)
			defer func() { _ = refused.Body.Close() }()
			assert.Equal(t, http.StatusForbidden, refused.StatusCode)
			var refusal api.Error
			require.NoError(t, decode(refused.Body, &refusal))
			assert.Equal(t, api.ErrorCodeCsrf, refusal.Code)

			// With it the request gets as far as the mode, and as far as the
			// API without it.
			page.Header.Set(csrfHeader, got.CsrfToken)
			sent := page.PostForm(t, APIPrefix+"/status", nil)
			defer func() { _ = sent.Body.Close() }()
			var outcome api.Error
			require.NoError(t, decode(sent.Body, &outcome))
			if readOnly {
				assert.Equal(t, http.StatusForbidden, sent.StatusCode)
				assert.Equal(t, api.ErrorCodeReadOnly, outcome.Code)
			} else {
				assert.Equal(t, http.StatusMethodNotAllowed, sent.StatusCode)
				assert.Equal(t, api.ErrorCodeMethodNotAllowed, outcome.Code)
			}
		})
	}
}

// decode reads the JSON a body holds into v.
func decode(body io.Reader, v any) error {
	return json.NewDecoder(body).Decode(v)
}
