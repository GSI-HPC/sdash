// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"crypto/rand"
	"crypto/subtle"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/GSI-HPC/sdash/internal/api"
)

// tokenParameter is the query parameter the launch token travels in on the
// first navigation.
const tokenParameter = "token"

// newToken returns the secret of one launch: 26 characters of the base32
// alphabet, which hold 128 bits from the system's random source and need no
// escaping in a URL or a cookie. It lives in memory only and ends with the
// process, so a bookmark of an earlier launch signs nobody in.
func newToken() string {
	return rand.Text()
}

// cookieName names the session cookie of a request that was sent to port.
//
// A browser keeps cookies per host name and ignores the port, so two sdash
// processes on one machine share a cookie jar. With the port in the name
// each has a cookie of its own and neither signs the other's browser out.
//
// The port is the one in the Host header of the request (requestPort) and
// not one the server is bound to. For a listener on TCP the two are the
// same, since the Host check lets nothing else through. A listener on a
// unix socket is bound to no port: the browser names the port of the
// forward in front of it, and that is the port its cookies have to be told
// apart by.
func cookieName(port string) string {
	return "sdash_session_" + port
}

// exchangeToken turns the token in the address of the first navigation into
// the session cookie, and redirects to the same address without the token so
// that it does not stay in the address bar. It wraps the pages of the user
// interface; an address under /api/ never exchanges anything.
//
// The cookie is HttpOnly, so no script can read it, and SameSite=Strict, so
// the browser leaves it out of every request another site causes. It has no
// Secure attribute, which not every supported browser accepts over the plain
// HTTP of a loopback listener, and no lifetime: it ends with the browser
// session, and its value with the process.
func exchangeToken(token string, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			query := r.URL.Query()
			if r.Method != http.MethodGet || !query.Has(tokenParameter) {
				next.ServeHTTP(w, r)
				return
			}
			if !sameSecret(query.Get(tokenParameter), token) {
				logger.Warn("refusing a token that is not this launch's", "path", r.URL.Path)
				refuse(w, http.StatusForbidden,
					"this address belongs to an earlier run of sdash; open the one it printed when it started")
				return
			}

			http.SetCookie(w, &http.Cookie{
				Name:     cookieName(requestPort(r)),
				Value:    token,
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteStrictMode,
			})
			query.Del(tokenParameter)
			// A path that begins with two slashes would read as the name of
			// another host in a Location header.
			target := url.URL{Path: "/" + strings.TrimLeft(r.URL.Path, "/"), RawQuery: query.Encode()}
			// No cache may keep an entry under an address that holds the
			// token.
			w.Header().Set("Cache-Control", "no-store")
			http.Redirect(w, r, target.String(), http.StatusSeeOther)
		})
	}
}

// requireSession refuses every request that does not carry the session
// cookie of this launch. It guards the browser API.
func requireSession(token string, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sent, err := r.Cookie(cookieName(requestPort(r)))
			if err != nil || !sameSecret(sent.Value, token) {
				// A tab left open across a restart asks again and again, so
				// this is no warning.
				logger.Debug("refusing a request without the session cookie",
					"method", r.Method, "path", r.URL.Path)
				writeError(w, http.StatusUnauthorized, api.ErrorCodeNotSignedIn,
					"not signed in; open the address sdash printed when it started")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// sameSecret compares a value a client sent with the secret in constant
// time, so that the time an answer takes tells nothing about how much of a
// guess was right. An empty secret matches nothing: a server put together
// without a token must not accept the absence of one.
func sameSecret(sent, secret string) bool {
	return secret != "" && subtle.ConstantTimeCompare([]byte(sent), []byte(secret)) == 1
}
