// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package version reports the build provenance of the sdash binary, and
// renders it as the User-Agent sdash names itself with.
//
// No version number is stored in the source tree
// (doc/adr/0019-version-in-a-signed-tag.md). Release builds inject one from
// the signed git tag through -ldflags; every other build derives what it can
// from the VCS stamps the Go toolchain embeds.
//
// Adapted from GSI-HPC/clusterctl internal/version.
package version

import (
	"cmp"
	"fmt"
	"runtime"
	"strings"

	"github.com/GSI-HPC/go-clikit/cobratree"
)

// Values injected by the release build. Keep the names in sync with the
// ldflags in .goreleaser.yaml. They are variables because the linker can set
// nothing else; nothing in the program writes them.
var (
	version string
	commit  string
	date    string
)

// Info describes the running binary.
type Info struct {
	// Version is the release version, "v1.4.0" style: the one the release
	// build injected, or the module version "go install" built. It is
	// "devel" for any other build, a build from a checkout included.
	Version string `json:"version"`
	// Commit is the git revision the binary was built from, empty when the
	// build carried no VCS information.
	Commit string `json:"commit,omitempty"`
	// Date is the build or commit timestamp in RFC 3339 form.
	Date string `json:"date,omitempty"`
	// Dirty reports whether the working tree held uncommitted changes.
	Dirty bool `json:"dirty,omitempty"`
	// GoVersion is the toolchain that produced the binary.
	GoVersion string `json:"goVersion"`
	// Platform is the target the binary was built for, as os/arch.
	Platform string `json:"platform"`
}

// Get assembles the build provenance, preferring values injected at release
// time and falling back to the VCS stamps in the build info.
func Get() Info {
	info := Info{
		Version:   version,
		Commit:    commit,
		Date:      date,
		GoVersion: runtime.Version(),
		Platform:  runtime.GOOS + "/" + runtime.GOARCH,
	}
	return fromBuildInfo(info, cobratree.ReadBuildInfo())
}

// fromBuildInfo fills what the release build did not inject from the build
// info the toolchain embedded, as cobratree.ReadBuildInfo read it.
//
// A build from a checkout reports devel with its revision, and a build of a
// module version from the proxy reports that version: cobratree leaves the
// version empty for a checkout, whose pseudo-version or local tag is not a
// signed release (doc/adr/0019-version-in-a-signed-tag.md).
func fromBuildInfo(info Info, bi cobratree.BuildInfo) Info {
	info.Version = cmp.Or(info.Version, bi.Version)
	info.Commit = cmp.Or(info.Commit, bi.Commit)
	info.Date = cmp.Or(info.Date, bi.Time)
	info.Dirty = bi.Dirty
	info.Version = cmp.Or(info.Version, "devel")
	return info
}

// String renders the provenance as a single human readable line.
func (i Info) String() string {
	var b strings.Builder
	b.WriteString(i.Version)
	if i.Commit != "" {
		rev := i.Commit
		if len(rev) > 12 {
			rev = rev[:12]
		}
		fmt.Fprintf(&b, " (%s", rev)
		if i.Dirty {
			b.WriteString("-dirty")
		}
		b.WriteString(")")
	}
	if i.Date != "" {
		fmt.Fprintf(&b, " built %s", i.Date)
	}
	fmt.Fprintf(&b, " %s %s", i.GoVersion, i.Platform)
	return b.String()
}

// UserAgent renders the value of the User-Agent header that every request
// to slurmrestd carries, "sdash/<version> (<os>/<arch>)"
// (doc/adr/0008-user-agent.md). The version is the one String prints, so
// that what a site reads in an access log is what a user reads from "sdash
// version"; the header says nothing about the user or the machine.
func (i Info) UserAgent() string {
	return "sdash/" + i.Version + " (" + i.Platform + ")"
}

// UserAgent is the User-Agent of the running binary.
func UserAgent() string {
	return Get().UserAgent()
}
