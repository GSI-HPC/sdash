// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/GSI-HPC/go-clikit/localweb"

	"github.com/GSI-HPC/sdash/internal/api"
)

// vitePort is the port of the Vite dev server ("npm run dev" in web/), which
// proxies /api to this server in the development loop "make dev" prints.
const vitePort = "5173"

// viteOrigins are the origins the Vite dev server serves its pages from.
// Its proxy names this server by its own address in Host, but forwards the
// browser's Origin header unchanged, and that names the dev server. They
// are let past the same-origin check of the API with --dev, and nothing else
// is relaxed.
var viteOrigins = []string{"http://localhost:" + vitePort, "http://127.0.0.1:" + vitePort}

// The checks every request passes are localweb's: the Host allow-list
// (localweb.Hosts), the same-origin check (localweb.SameOrigin) and the
// security headers (localweb.Headers). What sdash adds is how it words a
// refusal and what it logs, below
// (doc/adr/0026-go-clikit-localweb-for-the-listener-and-the-guard.md).

// refuseHost answers a request for a host that is not this listener's: in
// plain text, whatever its address, since what it turns away is not the user
// interface. The reason goes to the log in full and to the client not at all.
func refuseHost(logger *slog.Logger) localweb.Refuser {
	return func(w http.ResponseWriter, r *http.Request, f localweb.Refusal) {
		logger.Warn("refusing a request for a host that is not this listener",
			"host", r.Host, "path", r.URL.Path)
		localweb.Refuse(w, r, f)
	}
}

// refuseCrossSite answers a request that a page of another site caused. Under
// /api/ it is the Error of api/openapi.yaml, as every other refusal of the
// checks that guard the API, so that the user interface has one shape to read
// whatever refused it. Elsewhere it is plain text.
func refuseCrossSite(logger *slog.Logger) localweb.Refuser {
	return func(w http.ResponseWriter, r *http.Request, f localweb.Refusal) {
		logger.Warn("refusing a request from another origin",
			"reason", f.Reason, "method", r.Method, "path", r.URL.Path)
		if underAPI(r.URL.Path) {
			writeError(w, f.Status, api.ErrorCodeCrossOrigin, f.Message)
			return
		}
		localweb.Refuse(w, r, f)
	}
}

// underAPI reports whether path is the API's: the bare prefix or an address
// below it. The router registers the same two patterns, so a check that goes
// by the path and the route that is taken agree.
func underAPI(path string) bool {
	return path == "/api" || strings.HasPrefix(path, "/api/")
}

// sameOrigin refuses every request that a page of another site caused, by
// the rule that suits the address. A page of the interface may be navigated
// to from anywhere, as a link in a mail is. Under /api/ nothing is a page:
// the request comes from a page of the server's own origin, whatever its
// method, and a navigation to an address of the API is refused too. Reads are
// checked like writes: the answer to a GET shows the cluster as the signed-in
// user sees it, and no CORS header relaxes this for anyone.
//
// With dev, the origins of the Vite dev server pass for the API.
func sameOrigin(dev bool, logger *slog.Logger) func(http.Handler) http.Handler {
	refuse := refuseCrossSite(logger)
	apiOrigin := localweb.Origin{Refuse: refuse}
	if dev {
		apiOrigin.Others = viteOrigins
	}
	forAPI := localweb.SameOrigin(apiOrigin)
	forPages := localweb.SameOrigin(localweb.Origin{Navigate: true, Refuse: refuse})
	return func(next http.Handler) http.Handler {
		checkAPI, checkPages := forAPI(next), forPages(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if underAPI(r.URL.Path) {
				checkAPI.ServeHTTP(w, r)
				return
			}
			checkPages.ServeHTTP(w, r)
		})
	}
}

// refuse answers a request that one of the server's own checks rejects, with
// one plain line and no detail a hostile page could learn from. The reason
// in full goes to the log.
func refuse(w http.ResponseWriter, status int, reason string) {
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, reason, status)
}
