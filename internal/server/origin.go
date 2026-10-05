// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"log/slog"
	"net/http"

	"github.com/GSI-HPC/sdash/internal/api"
)

// vitePort is the port of the Vite dev server ("npm run dev" in web/), which
// proxies /api to this server in the development loop "make dev" prints.
const vitePort = "5173"

// sameOrigin refuses every request that a page of another origin caused,
// whatever its method. It guards the browser API.
//
// Reads are checked like writes: the answer to a GET shows the cluster as
// the signed-in user sees it. No CORS header relaxes this for anyone. With
// dev, the origins of the Vite dev server are accepted: its proxy names
// this server by its own address in Host, but forwards the browser's Origin
// header unchanged, and that names the dev server.
func sameOrigin(dev bool, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if reason := crossOrigin(r, dev); reason != "" {
				logger.Warn("refusing a request from another origin",
					"reason", reason, "method", r.Method, "path", r.URL.Path)
				writeError(w, http.StatusForbidden, api.ErrorCodeCrossOrigin,
					"requests from other origins are refused")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// crossOrigin says why a request does not come from the server's own
// origin, and returns "" when it does.
//
// Two headers are read, and a browser lets no page set or remove either:
//
//   - Sec-Fetch-Site must be same-origin. "none" means the user caused the
//     request, by typing the address or opening a bookmark, and is accepted
//     for a navigation only. "same-site" is refused: every other port of
//     localhost is the same site, and those belong to other programs and,
//     on a shared host, to other users.
//   - Origin, when the browser sends it, must be the scheme and host the
//     request itself was sent to.
//
// A request with neither header is let through to the session check. A
// command line client sends neither, and so does a browser that does not
// know Sec-Fetch-Site, on a GET. For that browser the SameSite=Strict
// attribute of the session cookie is the defence: the cookie stays out of a
// request another site caused, and without it nothing under /api/ is served.
func crossOrigin(r *http.Request, dev bool) string {
	switch site := r.Header.Get("Sec-Fetch-Site"); {
	case site == "", site == "same-origin":
	case site == "none" && r.Header.Get("Sec-Fetch-Mode") == "navigate":
	default:
		return "Sec-Fetch-Site is " + site
	}
	origin := r.Header.Get("Origin")
	if origin == "" || origin == ownOrigin(r) || (dev && isViteOrigin(origin)) {
		return ""
	}
	return "Origin is " + origin
}

// ownOrigin returns the origin a request was sent to. Its host has passed
// allowHosts by the time anything is compared with it.
func ownOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// isViteOrigin reports whether origin is one the Vite dev server serves its
// pages from.
func isViteOrigin(origin string) bool {
	return origin == "http://localhost:"+vitePort || origin == "http://127.0.0.1:"+vitePort
}
