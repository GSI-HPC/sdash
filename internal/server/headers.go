// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import "net/http"

// contentSecurityPolicy lets a page load and contact its own origin and
// nothing else (doc/adr/0012-local-listener-security.md). Each directive is
// there for a reason:
//
//   - default-src, script-src, style-src, font-src, connect-src 'self': the
//     interface is built into the binary, so nothing it needs lives
//     elsewhere. There is no 'unsafe-inline' and no 'unsafe-eval': the build
//     must emit scripts and styles as files.
//   - img-src 'self' data: the bundler inlines small images as data URLs.
//   - object-src 'none', base-uri 'none': no plugins, and no <base> element
//     that would point relative URLs at another host.
//   - frame-ancestors 'none': no other page may frame the interface and
//     have the user click through it.
//   - form-action 'self': a form cannot post what the page shows elsewhere.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; " +
	"img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
	"object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

// securityHeaders sets the headers every response carries, a refusal
// included: it is the outermost check so that no later one can answer
// without them.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		// A response is what its Content-Type says and nothing a browser
		// guesses from its bytes.
		h.Set("X-Content-Type-Options", "nosniff")
		// The address of the first navigation holds the launch token, and
		// no address of the interface is any other site's business.
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// noStore keeps the answers of the browser API out of every cache: they
// show the cluster as the signed-in user sees it, and a copy on disk would
// outlive the session.
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// refuse answers a request that one of the listener's checks rejects, with
// one plain line and no detail a hostile page could learn from. The reason
// in full goes to the log.
func refuse(w http.ResponseWriter, status int, reason string) {
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, reason, status)
}
