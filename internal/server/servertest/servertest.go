// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package servertest holds what the tests of sdash's listener share with
// the tests of the packages that start one.
//
// It exists for the one thing every test with a unix socket needs and none
// gets from package testing: a directory whose path is short enough for a
// socket. It imports nothing of sdash, so that the tests inside package
// server can use it too.
package servertest

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// SocketDir returns a directory of the test's own to put a unix socket in:
// one that only the user may write to, named without a symbolic link, and
// short enough that fits accepts it. It is removed when the test ends.
//
// fits says whether the paths the test is going to use below the directory
// are short enough for a socket address, which takes about a hundred bytes.
// The directory of t.TempDir is tried first. Its path holds the name of the
// test and may be too long by that alone, so a directory with a short name
// in the temporary directory comes next. That directory can itself be too
// long, as the one of a build root or of macOS can, and then no directory
// below it will do: the last one tried lies in /tmp.
func SocketDir(t testing.TB, fits func(dir string) bool) string {
	t.Helper()
	dir := resolve(t, t.TempDir())
	for _, parent := range []string{os.TempDir(), "/tmp"} {
		if fits(dir) {
			break
		}
		made, err := os.MkdirTemp(parent, "sdash")
		require.NoError(t, err)
		t.Cleanup(func() { _ = os.RemoveAll(made) })
		dir = resolve(t, made)
	}
	require.True(t, fits(dir), "no temporary directory is short enough for a socket; the shortest is %s", dir)
	// t.TempDir leaves the mode to the umask, which on some systems lets
	// the group write, and sdash refuses a socket in such a directory.
	require.NoError(t, os.Chmod(dir, 0o700))
	return dir
}

// resolve returns dir by the name sdash reports a socket in it under: the
// temporary directory of macOS is reached through a symbolic link.
func resolve(t testing.TB, dir string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(dir)
	require.NoError(t, err)
	return resolved
}
