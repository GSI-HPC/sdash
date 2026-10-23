// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"log/slog"
	"net/http"

	"github.com/GSI-HPC/go-clikit/localweb"
	"github.com/GSI-HPC/go-clikit/localweb/session"

	"github.com/GSI-HPC/sdash/internal/api"
)

const (
	// cookiePrefix begins the name of the session cookie, which ends in the
	// port of the request's Host header.
	//
	// A browser keeps cookies per host name and ignores the port, so two
	// sdash processes on one machine share a cookie jar. With the port in the
	// name each has a cookie of its own and neither signs the other's browser
	// out. For a listener on a unix socket the port is the one of the forward
	// in front of it, which the browser names, and not one the server is bound
	// to (doc/adr/0023-the-listeners-as-built.md).
	cookiePrefix = "sdash_session_"
	// csrfHeader carries the CSRF token of the session on a request that may
	// change something. The interface reads the token with the operation
	// getSession of api/openapi.yaml.
	csrfHeader = "X-Sdash-CSRF"
)

// The texts of localweb/session that this package tells apart. They are an
// interface of go-clikit (decision 34 of its doc/decisions.md), and a test
// drives each refusal through the session, so that a change of one fails
// there and not unseen.
const (
	notSignedInText = "This browser is not signed in."
	noCSRFText      = "The request lacks this page's CSRF token. Reload the page."
)

// openTheAddress is the line a refusal of a page adds: where to find the
// address that signs a browser in.
const openTheAddress = "Open the address sdash printed when it started."

// newSessions returns the sessions of the launch whose secret is token. It
// exchanges the token of the address the user opens for the session cookie,
// refuses what carries no session, and asks every request that may change
// something for the CSRF token of its session
// (doc/adr/0026-go-clikit-localweb-for-the-listener-and-the-guard.md).
func newSessions(token string, logger *slog.Logger) (*session.Manager, error) {
	return session.New(session.Options{
		Token:        token,
		CookiePrefix: cookiePrefix,
		CSRFHeader:   csrfHeader,
		Refuse:       refuseSession(logger),
	})
}

// refuseSession answers a request that has no session, or that could change
// something and lacks the CSRF token of its session. Under /api/ the answer
// is the Error of api/openapi.yaml, as for every other refusal of the checks
// that guard the API, and the status the document names for it; elsewhere it
// is plain text, with the line that says where the address is.
func refuseSession(logger *slog.Logger) localweb.Refuser {
	return func(w http.ResponseWriter, r *http.Request, f localweb.Refusal) {
		// A tab left open across a restart asks again and again, so a request
		// without a session is no warning.
		level := slog.LevelWarn
		if f.Message == notSignedInText {
			level = slog.LevelDebug
		}
		// The path alone: the query of the first navigation holds the token.
		logger.Log(r.Context(), level, "refusing a request without a valid session",
			"reason", f.Reason, "method", r.Method, "path", r.URL.Path)

		if underAPI(r.URL.Path) {
			switch f.Message {
			case notSignedInText:
				writeError(w, http.StatusUnauthorized, api.ErrorCodeNotSignedIn,
					"not signed in; open the address sdash printed when it started")
			case noCSRFText:
				writeError(w, f.Status, api.ErrorCodeCsrf, f.Message)
			default:
				writeError(w, f.Status, api.ErrorCodeBadRequest, f.Message)
			}
			return
		}
		if f.Message != noCSRFText {
			f.Message += " " + openTheAddress
		}
		localweb.Refuse(w, r, f)
	}
}
