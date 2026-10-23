// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"cmp"
	"io/fs"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/GSI-HPC/go-clikit/localweb"
	"github.com/GSI-HPC/go-clikit/localweb/session"
)

// APIPrefix is the base path of the browser API, as api/openapi.yaml
// declares it (doc/adr/0011-openapi-first-browser-api.md). The handler in
// Config.API is mounted here.
const APIPrefix = "/api/v1"

// routerConfig is what the handler tree is built from.
type routerConfig struct {
	// answers says which values of the Host header the listeners answer to
	// (localweb.Bound.Answers).
	answers func(host string) bool
	// sessions are the sessions of this launch.
	sessions *session.Sessions
	// dev accepts the requests the Vite dev server proxies.
	dev bool
	// readOnly refuses every request under /api/ that could change
	// something (readsOnly).
	readOnly bool
	// files holds the built user interface.
	files fs.FS
	// api is the handler of the browser API, or nil.
	api http.Handler
	// logger receives the refusals and, at debug level, every request.
	logger *slog.Logger
}

// newRouter builds the handler tree of the listener.
//
// Every request passes the security headers, the Host allow-list, a check
// that no page of another site caused it (sameOrigin) and the session: the
// cookie that only the browser the launch token signed in has. The session
// is checked before the router looks at the address, so that a request
// without one learns nothing about which addresses exist. What lies under
// /api/ then passes the guarded chain: no caching and, in read-only mode, a
// method that changes nothing. The API handler sits behind that chain and is
// reachable through it alone, so an operation added to the API cannot be
// registered around the checks.
//
// The read-only check comes after the session check, so that a request
// without a session is answered as it is in every mode and learns nothing
// about this one.
//
// The handler in cfg.api receives each request with its full path, the
// /api/v1 prefix included; the router does not strip it.
func newRouter(cfg routerConfig) http.Handler {
	checks := chi.Middlewares{localweb.NoStore}
	if cfg.readOnly {
		checks = append(checks, readsOnly(cfg.logger))
	}
	guarded := chi.Chain(checks...)

	r := chi.NewRouter()
	r.Use(
		logRequests(cfg.logger),
		localweb.Headers(""),
		localweb.Hosts(cfg.answers, localweb.HostsOptions{Refuse: refuseHost(cfg.logger)}),
		sameOrigin(cfg.dev, cfg.logger),
		cfg.sessions.Middleware,
	)
	if cfg.api != nil {
		r.Handle(APIPrefix+"/*", guarded.Handler(cfg.api))
	}
	// Registered whether or not an API is mounted, so that an address under
	// /api/ never falls through to the user interface, which would answer
	// it with the index page. The pattern with the wildcard does not match
	// the bare prefix, which is registered beside it for the same reason.
	r.Handle("/api", guarded.HandlerFunc(apiNotFound))
	r.Handle("/api/*", guarded.HandlerFunc(apiNotFound))
	r.Handle("/*", static{files: cfg.files})
	return r
}

// logRequests logs every request at debug level. It logs the path and never
// the query string: the query of the first navigation holds the launch
// token, and a log is read by more people than a terminal.
func logRequests(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !logger.Enabled(r.Context(), slog.LevelDebug) {
				next.ServeHTTP(w, r)
				return
			}
			recorder := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(recorder, r)
			logger.Debug("request",
				"method", r.Method,
				"path", r.URL.Path,
				// A handler that writes a body without a status has
				// answered 200.
				"status", cmp.Or(recorder.Status(), http.StatusOK),
			)
		})
	}
}
