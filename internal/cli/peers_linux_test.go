// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build linux

package cli

import (
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The user's ID is the one the process reports, and the server keeps out the
// connections of every other: this holds the wire between the two.
func TestTheServerClosesTheConnectionsOfOtherUsers(t *testing.T) {
	t.Parallel()

	for name, uid := range map[string]int{"the user": os.Getuid(), "another user": os.Getuid() + 1} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			l, stdout := begin(t, Process{
				Args:    []string{"--listen", "127.0.0.1:0", "--no-browser"},
				Browser: newDesktop(t, nil, nil).Opener,
				Getuid:  func() int { return uid },
			})
			line := l.said(t, stdout, "\n")
			address := strings.TrimPrefix(strings.TrimSuffix(line, "\n"), "sdash is serving at ")

			resp, err := http.Get(address) //nolint:noctx // the test ends with the server
			if err == nil {
				_ = resp.Body.Close()
			}

			// The page itself is not built in a test binary; what matters is
			// that the connection is answered or closed.
			if uid == os.Getuid() {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
