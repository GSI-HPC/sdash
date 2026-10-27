// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package releases

import (
	"net/http"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
)

// r2605 is Slurm 26.05, as the error cases of testdata/r2605/ show it on the
// sind cluster of e2e/testdata.
var r2605 = Profile{
	First: Release{Major: 26, Minor: 5},
	Status: map[int]errs.Kind{
		// slurmctld refused the request; for want of a permission it is 403
		// instead. Not captured yet: the capture sends no request that
		// changes anything.
		http.StatusUnprocessableEntity: errs.Rejected,
		// A malformed or an expired token on /slurm/, with Slurm error 1007
		// (expired-token-jobs.json). On /slurmdb/ the same token is 502 with
		// error 7000, as when slurmdbd cannot be reached
		// (expired-token-qos.json).
		http.StatusNetworkAuthenticationRequired: errs.Unauthenticated,
	},
}
