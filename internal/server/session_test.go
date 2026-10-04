// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net/http"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
	assert.Equal(t, testToken, cookie.Value)
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
		{name: "a backslash, which a browser reads as a slash", target: `/\evil.example/?token=` + testToken, want: "/%5Cevil.example/"},
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
// why instead of showing an interface that then fails on every request.
func TestATokenThatIsNotThisLaunchsIsRefused(t *testing.T) {
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
			assert.Contains(t, got.Body.String(), "earlier run")
		})
	}
}

// The exchange belongs to a navigation to a page. Under /api/ a parameter
// called token is the API's own business, and a POST is no navigation.
func TestOnlyANavigationToAPageExchangesTheToken(t *testing.T) {
	t.Parallel()

	stub := &apiStub{}
	router := testRouter(withAPI(stub))

	underAPI := serve(router, request(http.MethodGet, "/api/v1/status?token="+testToken))
	assert.Equal(t, http.StatusUnauthorized, underAPI.Code)
	assert.Empty(t, underAPI.Header().Get("Set-Cookie"))
	assert.Empty(t, stub.seen())

	posted := serve(router, request(http.MethodPost, "/?token="+testToken))
	assert.Equal(t, http.StatusMethodNotAllowed, posted.Code)
	assert.Empty(t, posted.Header().Get("Set-Cookie"))
}

// Any local process and any page can send a request to the port. The cookie
// is what only the user's signed-in browser has.
func TestTheAPIServesOnlyTheSessionOfThisLaunch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		cookie *http.Cookie
		want   int
	}{
		{name: "the cookie of this launch", cookie: &http.Cookie{Name: "sdash_session_7374", Value: testToken}, want: http.StatusOK},
		{name: "no cookie", want: http.StatusUnauthorized},
		{name: "the cookie of an earlier launch", cookie: &http.Cookie{Name: "sdash_session_7374", Value: "EARLIERLAUNCHEARLIERLAUNCH"}, want: http.StatusUnauthorized},
		{name: "an empty cookie", cookie: &http.Cookie{Name: "sdash_session_7374", Value: ""}, want: http.StatusUnauthorized},
		{
			// Cookies are kept per host name, whatever the port: the
			// cookie of a second sdash arrives here as well, under its own
			// name.
			name:   "the right value under another port's name",
			cookie: &http.Cookie{Name: "sdash_session_7375", Value: testToken},
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
			} else {
				assert.Empty(t, stub.seen())
				assert.NotContains(t, got.Body.String(), "stub")
			}
		})
	}
}

// A router put together without a token must not treat "no token" as the
// right one: an empty cookie would then sign anyone in.
func TestAnEmptySecretMatchesNothing(t *testing.T) {
	t.Parallel()

	assert.False(t, sameSecret("", ""))
	assert.False(t, sameSecret("anything", ""))
	assert.True(t, sameSecret(testToken, testToken))

	router := testRouter(withAPI(&apiStub{}), func(cfg *routerConfig) { cfg.token = "" })
	r := request(http.MethodGet, "/api/v1/status")
	r.AddCookie(&http.Cookie{Name: "sdash_session_7374", Value: ""})
	assert.Equal(t, http.StatusUnauthorized, serve(router, r).Code)
	assert.Equal(t, http.StatusForbidden, serve(router, request(http.MethodGet, "/?token=")).Code)
}

// The token goes into an address and into a cookie as it is, and it is all
// that stands between a local process and the user's Slurm identity.
func TestATokenIsLongRandomAndSafeInAnAddress(t *testing.T) {
	t.Parallel()

	first, second := newToken(), newToken()

	assert.NotEqual(t, first, second)
	// 26 characters of base32 hold 130 bits.
	assert.Regexp(t, regexp.MustCompile(`^[A-Z2-7]{26,}$`), first)
}

// Two sdash processes on one machine share the browser's cookies for
// 127.0.0.1; a name without the port would have each sign the other out.
func TestTheCookieIsNamedAfterThePort(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "sdash_session_7374", cookieName(7374))
	assert.NotEqual(t, cookieName(7374), cookieName(41233))
}

// A log is copied into issues and read by more people than a terminal is.
func TestTheLogNeverHoldsTheToken(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	router := testRouter(withAPI(&apiStub{}), withLogger(log.logger()))

	serve(router, request(http.MethodGet, "/jobs?token="+testToken))
	serve(router, request(http.MethodGet, "/?token="+testToken+"x"))
	serve(router, signedIn(request(http.MethodGet, "/api/v1/status?token="+testToken)))
	serve(router, request(http.MethodGet, "/api/v1/status?token="+testToken))

	assert.Contains(t, log.String(), "path=/jobs")
	assert.NotContains(t, log.String(), testToken)
}
