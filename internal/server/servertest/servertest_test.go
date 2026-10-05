// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package servertest_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/server/servertest"
)

// sdash refuses a socket in a directory that others may write to, and
// reports a socket by its path without symbolic links. A test compares
// what sdash says with the directory it was given, so the directory has to
// be named as sdash names it. The temporary directory of macOS is reached
// through a link; here one is made, so that the test says the same on every
// machine.
//
// Not parallel: the temporary directory is set in the environment, which
// belongs to the whole process.
func TestTheDirectoryIsTheUsersAloneAndNamedWithoutALink(t *testing.T) {
	target, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	link := filepath.Join(t.TempDir(), "link")
	require.NoError(t, os.Symlink(target, link))
	t.Setenv("TMPDIR", link)

	// A test of its own, so that its temporary directory is made after the
	// environment was set.
	t.Run("a test with a socket", func(t *testing.T) {
		dir := servertest.SocketDir(t, func(string) bool { return true })

		info, err := os.Lstat(dir)
		require.NoError(t, err)
		assert.True(t, info.IsDir())
		assert.Equal(t, fs.FileMode(0o700), info.Mode().Perm())
		assert.True(t, strings.HasPrefix(dir, target+string(filepath.Separator)), "%s lies in %s", dir, target)
	})
}

// The directory of t.TempDir carries the name of the test, which alone can
// make it too long for a socket.
func TestATestWithALongNameGetsADirectoryWithAShortOne(t *testing.T) {
	t.Parallel()

	temporary, err := filepath.EvalSymlinks(os.TempDir())
	require.NoError(t, err)
	// Room for a name in the temporary directory, and not for the name of
	// this test.
	fits := func(dir string) bool { return len(dir) <= len(temporary)+len("/sdash")+10 }

	dir := servertest.SocketDir(t, fits)

	assert.True(t, fits(dir), dir)
	assert.Equal(t, temporary, filepath.Dir(dir))
	assert.DirExists(t, dir)
}

// A build root, or a sandbox, can set a temporary directory that is longer
// than a socket path may be. Every test with a socket failed there, for a
// reason that was the machine's.
//
// Not parallel: the temporary directory is set in the environment, which
// belongs to the whole process.
func TestATemporaryDirectoryThatIsTooLongIsNotUsed(t *testing.T) {
	long := filepath.Join(t.TempDir(), strings.Repeat("d", 150))
	require.NoError(t, os.Mkdir(long, 0o700))
	t.Setenv("TMPDIR", long)
	fits := func(dir string) bool { return len(dir) <= 80 }

	var dir string
	// A test of its own, as above, and one whose end can be seen here.
	t.Run("a test with a socket", func(t *testing.T) {
		dir = servertest.SocketDir(t, fits)

		assert.True(t, fits(dir), dir)
		info, err := os.Lstat(dir)
		require.NoError(t, err)
		assert.Equal(t, fs.FileMode(0o700), info.Mode().Perm())
	})

	require.NotEmpty(t, dir)
	assert.NoDirExists(t, dir, "the directory goes when the test ends")
}
