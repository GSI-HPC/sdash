// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"log/slog"
	"net/http"

	"github.com/GSI-HPC/sdash/internal/api"
)

// readsOnly refuses every request whose method is not GET, HEAD or OPTIONS.
// It is the last check in front of the browser API when sdash runs with
// --read-only, the mode in which it sends nothing that changes a cluster
// (doc/adr/0012-local-listener-security.md; that the method decides is
// doc/adr/0023-the-listeners-as-built.md).
//
// The method alone decides, and that is enough because of a rule the
// browser API keeps (api/openapi.yaml): an operation that changes anything,
// on a cluster or in sdash, is never a GET. slurmrestd does not keep that
// rule. It requeues a job and has the daemons read their configuration
// again on a GET (doc/research/slurmrestd.md); in sdash's own API those are
// POST operations, and stop here like every other. An operation that broke
// the rule would get past this check, so the rule is what a review of a new
// operation holds it to.
//
// The check sits in front of the handler and not in each operation, so that
// an operation added later is covered without having to remember the mode.
func readsOnly(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
			default:
				// The interface does not offer what it knows the mode to
				// refuse, so this is worth a line, and it is no warning:
				// refusing is what the user asked for.
				logger.Info("refusing a request that could change something, in read-only mode",
					"method", r.Method, "path", r.URL.Path)
				writeError(w, http.StatusForbidden, api.ErrorCodeReadOnly,
					"sdash runs read-only and changes nothing; to do this, start it without --read-only")
			}
		})
	}
}
