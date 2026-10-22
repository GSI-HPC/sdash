// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package version

import (
	"regexp"
	"runtime"
	"testing"

	"github.com/GSI-HPC/go-clikit/cobratree"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A build without a tag, which every test binary is, must still name a
// version: the User-Agent and "sdash version" have nothing else to show.
func TestGetReportsAVersionForABuildWithoutATag(t *testing.T) {
	t.Parallel()

	info := Get()

	assert.NotEmpty(t, info.Version)
	assert.Equal(t, runtime.Version(), info.GoVersion)
	assert.Equal(t, runtime.GOOS+"/"+runtime.GOARCH, info.Platform)
}

func TestStringShortensTheRevisionAndMarksADirtyTree(t *testing.T) {
	t.Parallel()

	info := Info{
		Version:   "v1.2.3",
		Commit:    "0123456789abcdef0123456789abcdef01234567",
		Date:      "2026-09-22T10:00:00Z",
		Dirty:     true,
		GoVersion: "go1.26.0",
		Platform:  "linux/amd64",
	}

	assert.Equal(t, "v1.2.3 (0123456789ab-dirty) built 2026-09-22T10:00:00Z go1.26.0 linux/amd64", info.String())
}

// Only a signed release tag and the checksum database vouch for a version
// number. cobratree leaves the version empty for everything a checkout can
// claim, a pseudo-version or a local tag, and sdash reports it as devel.
func TestFromBuildInfoTakesAVersionOnlyFromWhatVouchesForIt(t *testing.T) {
	t.Parallel()

	const rev = "ebed4872343d0123456789abcdef0123456789ab"
	tests := []struct {
		name string
		bi   cobratree.BuildInfo
		want Info
	}{
		{
			name: "a checkout build reports devel and its revision",
			bi:   cobratree.BuildInfo{Commit: rev, Time: "2026-09-23T18:09:18Z"},
			want: Info{Version: "devel", Commit: rev, Date: "2026-09-23T18:09:18Z"},
		},
		{
			name: "a dirty checkout build is marked dirty",
			bi:   cobratree.BuildInfo{Commit: rev, Time: "2026-09-23T18:09:18Z", Dirty: true},
			want: Info{Version: "devel", Commit: rev, Date: "2026-09-23T18:09:18Z", Dirty: true},
		},
		{
			// go install ...@v1.4.0 builds the module from the proxy, which
			// carries no VCS stamps; its version is vouched for by sum.golang.org.
			name: "go install of a release reports the module version",
			bi:   cobratree.BuildInfo{Version: "v1.4.0"},
			want: Info{Version: "v1.4.0"},
		},
		{
			name: "a build without any provenance reports devel",
			want: Info{Version: "devel"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, fromBuildInfo(Info{}, tt.bi))
		})
	}
}

// The release build's values come from the signed tag; the stamps of the
// checkout it was built in must not replace them.
func TestFromBuildInfoPrefersTheInjectedValues(t *testing.T) {
	t.Parallel()

	injected := Info{Version: "v1.4.0", Commit: "a1b2c3d4e5f6", Date: "2026-09-22T14:42:30Z"}
	bi := cobratree.BuildInfo{Commit: "ebed4872343d", Time: "2026-09-23T18:09:18Z"}

	assert.Equal(t, injected, fromBuildInfo(injected, bi))
}

// The site reads this value in an access log, so its shape is a contract
// (doc/adr/0008-user-agent.md).
func TestUserAgentNamesTheVersionAndThePlatform(t *testing.T) {
	t.Parallel()

	info := Info{Version: "v0.1.0", Commit: "a1b2c3d4e5f6", Platform: "linux/arm64"}

	assert.Equal(t, "sdash/v0.1.0 (linux/arm64)", info.UserAgent())
}

// Whatever version a build reports, a pseudo-version with its "+dirty"
// included, the header must stay a product token and a comment as RFC 9110
// defines them, or an HTTP library on the way may drop or reject it.
func TestUserAgentOfTheRunningBinaryIsAProductAndAComment(t *testing.T) {
	t.Parallel()

	const token = "[!#$%&'*+.^_`|~0-9A-Za-z-]+"
	shape := regexp.MustCompile(`^sdash/` + token + ` \(` + token + `/` + token + `\)$`)

	got := UserAgent()

	require.Regexp(t, shape, got)
	assert.Equal(t, Get().UserAgent(), got)
}
