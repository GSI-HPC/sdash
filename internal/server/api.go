// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"cmp"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/version"
)

// APIConfig is what the handler of the browser API is built from.
type APIConfig struct {
	// Build describes the running binary, as "sdash version" prints it.
	Build version.Info
	// ReadOnly says that sdash was started with --read-only.
	ReadOnly bool
	// Logger receives what goes wrong while a request is answered. Nothing
	// is logged without one.
	Logger *slog.Logger
}

// NewAPI returns the handler of the browser API: the operations that
// api/openapi.yaml defines, behind the routing generated from it
// (doc/adr/0011-openapi-first-browser-api.md).
//
// The handler checks nothing about who is asking. It is handed to New as
// Config.API, and the router puts it behind the same-origin and session
// checks; mounted anywhere else it would answer everyone.
func NewAPI(cfg APIConfig) http.Handler {
	logger := cmp.Or(cfg.Logger, slog.New(slog.DiscardHandler))
	return newAPIHandler(operations{status: newStatus(cfg, logger)}, logger)
}

// newAPIHandler puts the generated routing in front of an implementation of
// the operations, and sees to it that every answer that is not a success is
// the Error of the document, whichever layer gives it.
func newAPIHandler(operations api.StrictServerInterface, logger *slog.Logger) http.Handler {
	router := chi.NewRouter()
	router.NotFound(apiNotFound)
	router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		// A 405 has to name the methods the address does accept, and chi
		// leaves that to whoever replaces its own handler.
		for _, method := range routedMethods {
			if router.Match(chi.NewRouteContext(), method, r.URL.Path) {
				w.Header().Add("Allow", method)
			}
		}
		writeError(w, http.StatusMethodNotAllowed, api.ErrorCodeMethodNotAllowed,
			"the API has nothing for "+r.Method+" at this address")
	})

	// What the generated code calls when it cannot read the parameters or
	// the body of a request. No operation has either yet, so nothing calls
	// it; it is set all the same, because the generated default answers in
	// plain text and would be forgotten when the first parameter arrives.
	badRequest := func(w http.ResponseWriter, _ *http.Request, err error) {
		writeError(w, http.StatusBadRequest, api.ErrorCodeBadRequest, err.Error())
	}
	strict := api.NewStrictHandlerWithOptions(operations, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: badRequest,
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			// The cause goes to the log and not to the browser: an error
			// from deep inside sdash is not written for the person there.
			logger.Error("cannot answer a request to the browser API",
				"method", r.Method, "path", r.URL.Path, "error", err)
			writeError(w, http.StatusInternalServerError, api.ErrorCodeInternal,
				"sdash failed to answer; its log says why")
		},
	})
	return api.HandlerWithOptions(strict, api.ChiServerOptions{
		// The generated code registers each operation under this prefix, so
		// the handler takes requests with their full path, as the router
		// hands them over.
		BaseURL:          APIPrefix,
		BaseRouter:       router,
		ErrorHandlerFunc: badRequest,
	})
}

// routedMethods are the methods an operation of the API can have: the ones
// OpenAPI 3.0 knows.
var routedMethods = []string{
	http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut,
	http.MethodPatch, http.MethodDelete, http.MethodOptions, http.MethodTrace,
}

// apiNotFound answers an address under /api/ that no operation lives at.
func apiNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, api.ErrorCodeNotFound, "the API has nothing at this address")
}

// writeError answers a request under /api/ that does not get what it asked
// for, with the Error of api/openapi.yaml. The checks that guard the API
// answer with it as the API itself does, so that the user interface has one
// shape to read whatever refused it. The checks that every address passes
// answer in plain text (refuse): what they turn away is not the user
// interface.
func writeError(w http.ResponseWriter, status int, code api.ErrorCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// A body that cannot be written means the client has gone, and there is
	// nobody left to tell.
	_ = json.NewEncoder(w).Encode(api.Error{Code: code, Message: message})
}

// operations implements the operations of the browser API.
type operations struct {
	// status is the answer of GetStatus. Nothing in it changes while the
	// process runs, so it is put together once.
	status api.Status
}

// GetStatus says which sdash is running.
func (o operations) GetStatus(context.Context, api.GetStatusRequestObject) (api.GetStatusResponseObject, error) {
	return api.GetStatus200JSONResponse(o.status), nil
}

// newStatus puts the status together from the build provenance and the
// flags. What the build does not know is left out, as the document says,
// and not sent empty.
func newStatus(cfg APIConfig, logger *slog.Logger) api.Status {
	status := api.Status{
		Version:   cfg.Build.Version,
		GoVersion: cfg.Build.GoVersion,
		Platform:  cfg.Build.Platform,
		ReadOnly:  cfg.ReadOnly,
		// Empty and not nil: the document promises a list, and a nil slice
		// is sent as null. No cluster can be configured yet, since
		// everything that speaks to Slurm waits for
		// doc/adr/0016-e2e-and-fixtures-on-sind.md.
		Clusters: []api.Cluster{},
	}
	if cfg.Build.Commit != "" {
		status.Commit = &cfg.Build.Commit
	}
	if cfg.Build.Date != "" {
		// The document declares a date-time. Both sources of the date, the
		// release build and the toolchain's VCS stamp, write RFC 3339; a
		// build that injects something else is reported and loses its date
		// rather than the whole status.
		date, err := time.Parse(time.RFC3339, cfg.Build.Date)
		if err != nil {
			logger.Warn("leaving the build date out of the status", "date", cfg.Build.Date, "error", err)
		} else {
			status.Date = &date
		}
	}
	return status
}
