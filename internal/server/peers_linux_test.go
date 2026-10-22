// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build linux

package server

import (
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The kernel tells whose a connection is, so a test can be both users: the
// server is told to keep out every user but the one it is not.
func TestAConnectionOfTheUserIsServedAndOneOfAnotherUserIsClosed(t *testing.T) {
	t.Parallel()

	own := os.Getuid()
	tests := []struct {
		name string
		uid  func() int
		ok   bool
	}{
		{name: "the user", uid: func() int { return own }, ok: true},
		{name: "another user", uid: func() int { return own + 1 }, ok: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			log := &logBuffer{}
			srv := start(t, Config{UID: tt.uid, Logger: log.logger()})
			client := browser(t)

			resp, err := client.Get(srv.URL())

			if tt.ok {
				require.NoError(t, err)
				assert.Equal(t, http.StatusOK, resp.StatusCode)
				require.NoError(t, resp.Body.Close())
				return
			}
			if err == nil {
				_ = resp.Body.Close()
			}
			require.Error(t, err, "the connection is closed before a request is read")
			require.Eventually(t, func() bool {
				return strings.Contains(log.String(), "closed the connection from")
			}, 10*time.Second, 5*time.Millisecond)
		})
	}
}
