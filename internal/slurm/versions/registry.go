// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package versions owns the data_parser versions sdash speaks, the key under
// which slurmrestd decides the shape of what it sends, and the choice of one
// of them for a connection
// (doc/adr/0005-versions-releases-and-capabilities.md).
//
// It is one of the two places that may name a data_parser version; the other
// is package releases, for the Slurm release. Every other package takes the
// Parser that Negotiate chose and builds its paths with it, so that adding a
// parser is a line here and a directory beside this file, never a search
// through handlers.
//
// Each parser has a directory of its own, named without the dots (v0045 for
// v0.0.45): the OpenAPI document slurmrestd generates for that parser alone,
// and in testdata/ the answers of a sind cluster in its shape, both copied by
// e2e/vendor.sh from a capture (doc/adr/0016-e2e-and-fixtures-on-sind.md).
package versions

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

// Parser is a data_parser version as slurmrestd names it in a path and in
// its OpenAPI document, "v0.0.45".
type Parser string

// known holds the parsers sdash speaks, oldest first. A parser is known once
// a capture of it on a sind cluster is vendored: v0.0.44, the parser of the
// floor release 25.11 (doc/adr/0004-slurm-25-11-is-the-floor.md), waits for
// a sind that runs a slurmrestd on 25.11
// (doc/adr/0031-slurmrestd-end-to-end-on-26-05.md).
var known = []Parser{"v0.0.45"}

// Known returns the parsers sdash speaks, oldest first.
func Known() []Parser {
	return slices.Clone(known)
}

// Dir is the directory of p beside this file, with its vendored document and
// its captured answers.
func (p Parser) Dir() string {
	return strings.ReplaceAll(string(p), ".", "")
}

// ErrNoKnownParser is the refusal of a server that offers none of the
// parsers sdash speaks.
var ErrNoKnownParser = errors.New("the server offers no data_parser version sdash speaks")

// Negotiate returns the newest parser sdash speaks among those a server
// offers, as its OpenAPI document lists them. A site may load only some
// parsers, so the newest one sdash knows is not always there; a server that
// offers none of them is refused with ErrNoKnownParser.
func Negotiate(offered []string) (Parser, error) {
	for _, p := range slices.Backward(known) {
		if slices.Contains(offered, string(p)) {
			return p, nil
		}
	}
	return "", fmt.Errorf("%w: it offers %s, sdash speaks %s", ErrNoKnownParser, list(offered), list(known))
}

// list joins parser names for a message, or says there are none.
func list[S ~string](ps []S) string {
	if len(ps) == 0 {
		return "none"
	}
	names := make([]string, len(ps))
	for i, p := range ps {
		names[i] = string(p)
	}
	return strings.Join(names, ", ")
}
