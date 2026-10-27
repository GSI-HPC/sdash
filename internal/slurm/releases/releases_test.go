// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package releases

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
)

func TestAReleaseReadsAndWritesAsSlurmWritesIt(t *testing.T) {
	t.Parallel()
	for _, s := range []string{"26.05.5", "25.11.0", "27.11.12"} {
		r, err := Parse(s)
		require.NoError(t, err, s)
		assert.Equal(t, s, r.String())
	}
	r, err := Parse("26.05.5")
	require.NoError(t, err)
	assert.Equal(t, Release{Major: 26, Minor: 5, Micro: 5}, r)
	assert.Equal(t, "26.05", r.Line())
}

func TestParseRefusesWhatIsNoRelease(t *testing.T) {
	t.Parallel()
	for _, s := range []string{"", "26.05", "26.05.5.1", "26.x.5", "26.-5.5", "Slurm-26.05.5"} {
		_, err := Parse(s)
		assert.Error(t, err, s)
	}
}

func TestLookupFitsAReleaseToAProfile(t *testing.T) {
	t.Parallel()
	newest := profiles[len(profiles)-1]
	cases := map[string]struct {
		release Release
		want    Profile
		fit     Fit
	}{
		"the first release of a line": {profiles[0].First, profiles[0], Tested},
		"a later maintenance release": {Release{profiles[0].First.Major, profiles[0].First.Minor, 9}, profiles[0], Tested},
		"a release after every line":  {Release{newest.First.Major + 1, newest.First.Minor, 0}, newest, Newer},
		"a release before every line": {Release{profiles[0].First.Major - 1, profiles[0].First.Minor, 0}, profiles[0], Older},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p, fit := Lookup(c.release)
			assert.Equal(t, c.want.Line(), p.Line())
			assert.Equal(t, c.fit, fit, fit.String())
		})
	}
}

// Each profile rests on error cases captured on its release line.
func TestEveryProfileHasItsErrorCases(t *testing.T) {
	t.Parallel()
	for _, p := range profiles {
		dirs, err := filepath.Glob(filepath.Join("testdata", p.First.dir(), "errors-*", "status.tsv"))
		require.NoError(t, err)
		assert.NotEmpty(t, dirs, p.Line())
	}
}

func TestAStatusAProfileDoesNotNameMeansWhatHTTPSays(t *testing.T) {
	t.Parallel()
	var p Profile
	cases := map[int]errs.Kind{
		http.StatusUnauthorized:        errs.Unauthenticated,
		http.StatusForbidden:           errs.Forbidden,
		http.StatusNotFound:            errs.NotFound,
		http.StatusMethodNotAllowed:    errs.Unsupported,
		http.StatusUnprocessableEntity: errs.Rejected,
		http.StatusBadGateway:          errs.Unavailable,
		http.StatusOK:                  errs.Protocol,
	}
	for status, want := range cases {
		assert.Equal(t, want, p.Kind(status), status)
	}
	p.Status = map[int]errs.Kind{http.StatusInternalServerError: errs.Rejected}
	assert.Equal(t, errs.Rejected, p.Kind(http.StatusInternalServerError), "the profile wins")
}
