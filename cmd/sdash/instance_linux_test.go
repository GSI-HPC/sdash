// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build linux

package main

import (
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// One sdash serves each user (doc/adr/0028-one-sdash-server-per-user.md):
// the processes are real, since a start never takes its own process for
// the server that runs. The second one ends by itself, and when the first
// stops, a start serves again.
func TestOneSdashServesEachUser(t *testing.T) {
	t.Parallel()
	runtimeDir := t.TempDir()

	first := startIn(t, runtimeDir, "main", "--no-browser")
	address := first.expect(t, "sdash is serving at ")

	second := startIn(t, runtimeDir, "main", "--no-browser")
	assert.Equal(t, address, second.expect(t, "sdash is serving at "),
		"the second start says where the first serves")
	require.NoError(t, second.wait(t, patience), "the second start ends by itself; stderr:\n%s", second.stderr)

	require.NoError(t, first.cmd.Process.Signal(syscall.SIGTERM))
	require.NoError(t, first.wait(t, patience), "stderr:\n%s", first.stderr)

	third := startIn(t, runtimeDir, "main", "--no-browser")
	assert.NotEqual(t, address, third.expect(t, "sdash is serving at "),
		"a server that has stopped is not found: its token ended with it")
	require.NoError(t, third.cmd.Process.Signal(syscall.SIGTERM))
	require.NoError(t, third.wait(t, patience), "stderr:\n%s", third.stderr)
}
