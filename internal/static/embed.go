// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package static holds the built user interface inside the binary, so that
// sdash is one file to copy and needs nothing beside it to serve its pages
// (doc/adr/0001-local-first-binary-with-embedded-ui.md).
//
// The interface is built by npm into web/dist and copied into dist/ here by
// "make build"; nothing of it is committed. Only dist/placeholder.txt is
// tracked, so that the embed directive below has something to match and
// "go build ./..." works on a checkout without Node. A binary built that way
// holds no interface, and the server says so in place of it
// (internal/server).
package static

import (
	"embed"
	"fmt"
	"io/fs"
)

// dist is a variable because go:embed fills nothing else; it is read-only.
// The "all:" prefix matters: without it the compiler leaves out files whose
// names begin with "." or "_", which a bundler is free to produce.
//
//go:embed all:dist
var dist embed.FS

// Files returns the embedded user interface with dist/ as its root, so that
// "index.html" and "assets/..." are the names a request path maps to.
func Files() (fs.FS, error) {
	files, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil, fmt.Errorf("open the embedded user interface: %w", err)
	}
	return files, nil
}
