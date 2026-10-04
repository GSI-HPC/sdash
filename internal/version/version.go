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
	"runtime/debug"
	"strings"
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
	bi, _ := debug.ReadBuildInfo()
	return fromBuildInfo(info, bi)
}

// fromBuildInfo fills what the release build did not inject from the build
// info the toolchain embedded; bi may be nil.
//
// A build from a checkout reports devel with its revision. The toolchain
// derives a module version from the checkout too, a pseudo-version or a tag
// the commit carries, but a local tag is not a signed release, so that is
// ignored. A module version is taken only from a build that carries no VCS
// stamps: "go install ...@v1.4.0", whose version the checksum database
// vouches for.
func fromBuildInfo(info Info, bi *debug.BuildInfo) Info {
	if bi != nil {
		checkout := false
		for _, s := range bi.Settings {
			switch s.Key {
			case "vcs.revision":
				checkout = true
				info.Commit = cmp.Or(info.Commit, s.Value)
			case "vcs.time":
				info.Date = cmp.Or(info.Date, s.Value)
			case "vcs.modified":
				info.Dirty = s.Value == "true"
			}
		}
		if info.Version == "" && !checkout && bi.Main.Version != "" && bi.Main.Version != "(devel)" {
			info.Version = bi.Main.Version
		}
	}

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
