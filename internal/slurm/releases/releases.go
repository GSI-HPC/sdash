// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package releases owns what sdash knows of each Slurm release line: how its
// slurmrestd behaves where the schema cannot say, keyed on the release the
// server reports and never on the data_parser version it speaks
// (doc/adr/0005-versions-releases-and-capabilities.md).
//
// It is one of the two places that may name a Slurm release; the other is
// package versions, for the data_parser version. A connection combines one
// parser with one Profile, and a release newer than any profile here gets
// the newest one, marked as untested. Each profile has a file of its own,
// r2605.go for 26.05, and the error cases it rests on lie in
// testdata/r2605/, copied from a capture by e2e/vendor.sh
// (doc/adr/0016-e2e-and-fixtures-on-sind.md).
package releases

import (
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
)

// Release is a Slurm release as slurmrestd reports it: in info.x-slurm of
// its OpenAPI document, and in meta.slurm of every answer.
type Release struct {
	Major, Minor, Micro int
}

// Parse reads a release in the form slurmrestd writes it, "26.05.5".
func Parse(s string) (Release, error) {
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return Release{}, fmt.Errorf("release %q: not of the form major.minor.micro", s)
	}
	var n [3]int
	for i, p := range parts {
		v, err := strconv.Atoi(p)
		if err != nil || v < 0 {
			return Release{}, fmt.Errorf("release %q: %q is not a number", s, p)
		}
		n[i] = v
	}
	return Release{Major: n[0], Minor: n[1], Micro: n[2]}, nil
}

// String writes r as Slurm does, with the minor in two digits.
func (r Release) String() string {
	return fmt.Sprintf("%d.%02d.%d", r.Major, r.Minor, r.Micro)
}

// Line is the release line of r, "26.05": the key of its Profile.
func (r Release) Line() string {
	return fmt.Sprintf("%d.%02d", r.Major, r.Minor)
}

// dir is the directory of the line's error cases below testdata, r2605.
func (r Release) dir() string {
	return fmt.Sprintf("r%d%02d", r.Major, r.Minor)
}

// before tells whether r came out before o.
func (r Release) before(o Release) bool {
	return slices.Compare([]int{r.Major, r.Minor, r.Micro}, []int{o.Major, o.Minor, o.Micro}) < 0
}

// Profile is how the slurmrestd of one release line behaves.
type Profile struct {
	// First is the first release of the line, 26.05.0.
	First Release

	// Status maps the HTTP status of an answer to the kind of failure it
	// stands for, where the answer carries no Slurm error number that says
	// more. The mapping differs between release lines: slurmctld refusing a
	// request is 500 on 25.11 and 422 on 26.05.
	Status map[int]errs.Kind
}

// Line is the release line of the profile, "26.05".
func (p Profile) Line() string {
	return p.First.Line()
}

// Kind returns the kind of failure that status stands for on this release
// line: what Status says, or what HTTP says of the status in general.
func (p Profile) Kind(status int) errs.Kind {
	if k, ok := p.Status[status]; ok {
		return k
	}
	switch {
	case status == http.StatusUnauthorized:
		return errs.Unauthenticated
	case status == http.StatusForbidden:
		return errs.Forbidden
	case status == http.StatusNotFound:
		return errs.NotFound
	case status == http.StatusMethodNotAllowed:
		return errs.Unsupported
	case status >= 500:
		return errs.Unavailable
	case status >= 400:
		return errs.Rejected
	}
	return errs.Protocol
}

// profiles holds a Profile for each release line sdash was tested on, the
// oldest first.
var profiles = []Profile{r2605}

// Fit says how a server's release relates to the profiles sdash has.
type Fit int

const (
	// Tested is a release of a line sdash has a profile of.
	Tested Fit = iota
	// Newer is a release after every line sdash has a profile of. It gets
	// the newest profile, and the user is told that it was not tested.
	Newer
	// Older is a release before every line sdash has a profile of. sdash
	// cannot speak to it in any case, since it offers none of the parsers
	// sdash knows; it gets the oldest profile all the same.
	Older
)

// String names the fit for a log.
func (f Fit) String() string {
	switch f {
	case Tested:
		return "tested"
	case Newer:
		return "newer than tested"
	case Older:
		return "older than tested"
	}
	return fmt.Sprintf("fit %d", int(f))
}

// Lookup returns the profile for a server of release r, and how well it
// fits: that of its line, or else that of the newest line before it.
func Lookup(r Release) (Profile, Fit) {
	p, fit := profiles[0], Older
	for _, q := range profiles {
		if q.Line() == r.Line() {
			return q, Tested
		}
		if !r.before(q.First) {
			p, fit = q, Newer
		}
	}
	return p, fit
}
