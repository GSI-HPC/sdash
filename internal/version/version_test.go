// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package version

import (
	"regexp"
	"runtime"
	"runtime/debug"
	"testing"

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
// number. Everything a checkout can claim, a pseudo-version or a local tag,
// is reported as devel.
func TestFromBuildInfoTakesAVersionOnlyFromWhatVouchesForIt(t *testing.T) {
	t.Parallel()

	const rev = "ebed4872343d0123456789abcdef0123456789ab"
	vcs := func(modified string) []debug.BuildSetting {
		return []debug.BuildSetting{
			{Key: "vcs", Value: "git"},
			{Key: "vcs.revision", Value: rev},
			{Key: "vcs.time", Value: "2026-09-23T18:09:18Z"},
			{Key: "vcs.modified", Value: modified},
		}
	}
	tests := []struct {
		name     string
		main     string
		settings []debug.BuildSetting
		want     Info
	}{
		{
			// Go 1.24 and later stamp a pseudo-version from the checkout; the
			// binary is still an unreleased build and says so.
			name:     "a checkout build reports devel and its revision",
			main:     "v0.0.0-20260923180918-ebed4872343d",
			settings: vcs("false"),
			want:     Info{Version: "devel", Commit: rev, Date: "2026-09-23T18:09:18Z"},
		},
		{
			// A tag in a local checkout is not a signed release.
			name:     "a checkout of a tag reports devel",
			main:     "v1.4.0",
			settings: vcs("false"),
			want:     Info{Version: "devel", Commit: rev, Date: "2026-09-23T18:09:18Z"},
		},
		{
			name:     "a dirty checkout build is marked dirty",
			main:     "v0.0.0-20260923180918-ebed4872343d+dirty",
			settings: vcs("true"),
			want:     Info{Version: "devel", Commit: rev, Date: "2026-09-23T18:09:18Z", Dirty: true},
		},
		{
			// go install ...@v1.4.0 builds the module from the proxy, which
			// carries no VCS stamps; its version is vouched for by sum.golang.org.
			name: "go install of a release reports the module version",
			main: "v1.4.0",
			want: Info{Version: "v1.4.0"},
		},
		{
			name: "a build without any provenance reports devel",
			main: "(devel)",
			want: Info{Version: "devel"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			bi := &debug.BuildInfo{
				Main:     debug.Module{Path: "github.com/GSI-HPC/sdash", Version: tt.main},
				Settings: tt.settings,
			}

			assert.Equal(t, tt.want, fromBuildInfo(Info{}, bi))
		})
	}
}

// A binary built without build info, as some packagers do, must not crash
// "sdash version".
func TestFromBuildInfoWorksWithoutBuildInfo(t *testing.T) {
	t.Parallel()

	assert.Equal(t, Info{Version: "devel"}, fromBuildInfo(Info{}, nil))
}

// The release build's values come from the signed tag; the stamps of the
// checkout it was built in must not replace them.
func TestFromBuildInfoPrefersTheInjectedValues(t *testing.T) {
	t.Parallel()

	injected := Info{Version: "v1.4.0", Commit: "a1b2c3d4e5f6", Date: "2026-09-22T14:42:30Z"}
	bi := &debug.BuildInfo{
		Main: debug.Module{Version: "v0.0.0-20260923180918-ebed4872343d"},
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "ebed4872343d"},
			{Key: "vcs.time", Value: "2026-09-23T18:09:18Z"},
		},
	}

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
