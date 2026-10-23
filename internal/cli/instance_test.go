// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/go-clikit/localweb/launch"
)

// withRuntimeDir is the environment of a user whose runtime directory is
// dir.
func withRuntimeDir(dir string) func(string) string {
	return func(name string) string {
		if name == runtimeDirVariable {
			return dir
		}
		return ""
	}
}

// serveIn starts sdash with the runtime directory dir and returns it, once
// it has printed its address, and that address. The arguments are those of
// the command line.
func serveIn(t *testing.T, getenv func(string) string, args ...string) (*launched, string) {
	t.Helper()
	l, stdout := begin(t, Process{Args: args, Getenv: getenv})
	line := l.said(t, stdout, "\n")
	address, found := strings.CutPrefix(strings.TrimSuffix(line, "\n"), "sdash is serving at ")
	require.True(t, found, "the first line of the output is %q", line)
	l.address = address
	return l, address
}

// readRecord returns the record of the server that runs in dir, a runtime
// directory.
func readRecord(t *testing.T, dir string) launch.Record {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, runtimeSubdir, launch.RecordFile))
	require.NoError(t, err)
	var record launch.Record
	require.NoError(t, json.Unmarshal(data, &record))
	return record
}

// A second start finds the server by its record, so the record names the
// address the first one printed and its own process, and it goes with the
// server: a stale one would be checked by the next start, but costs it a
// connection and a look at the owner of the socket.
func TestAServerWithoutFlagsLeavesARecordForTheNextStartAndRemovesIt(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	sdash, address := serveIn(t, withRuntimeDir(dir), "--no-browser")

	record := readRecord(t, dir)
	assert.Equal(t, address, record.URL)
	assert.Equal(t, os.Getpid(), record.PID)
	info, err := os.Stat(filepath.Join(dir, runtimeSubdir, launch.RecordFile))
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o600), info.Mode().Perm(), "the record holds the launch token")

	require.Equal(t, exitOK, sdash.stop())
	assert.NoFileExists(t, filepath.Join(dir, runtimeSubdir, launch.RecordFile))
}

// A command line that names --listen, --dev or --read-only asks for a server
// of its own, which a running one cannot stand in for: a read-only start
// that opened the browser on a server that is not read-only would be a
// mistake the user could not see.
func TestAServerThatAsksForItsOwnIsNeitherLookedForNorRecorded(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		args []string
	}{
		{name: "an address", args: []string{"--listen", "127.0.0.1:0"}},
		{name: "development", args: []string{"--listen", "127.0.0.1:0", "--dev"}},
		{name: "read-only", args: []string{"--listen", "127.0.0.1:0", "--read-only"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()
			sdash, _ := serveIn(t, withRuntimeDir(dir), append([]string{"--no-browser"}, tt.args...)...)

			assert.NoDirExists(t, filepath.Join(dir, runtimeSubdir))
			require.Equal(t, exitOK, sdash.stop())
			assert.Empty(t, sdash.stderr.String())
		})
	}
}

// The mac has no runtime directory. A server there is the one it was before
// the guard, and -v says why there is none.
func TestWithoutARuntimeDirectoryTheServerRunsAndSaysWhyItLooksForNone(t *testing.T) {
	t.Parallel()

	for name, dir := range map[string]string{"unset": "", "relative": "run/user"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			sdash, address := serveIn(t, withRuntimeDir(dir), "--no-browser", "-v")

			assert.NotEmpty(t, address)
			require.Equal(t, exitOK, sdash.stop())
			assert.Contains(t, sdash.stderr.String(),
				`msg="not looking for a running sdash" reason="XDG_RUNTIME_DIR is not set to an absolute path"`)
		})
	}
}

// A runtime directory that the guard refuses, here an sdash directory
// that others can enter, is no reason not to serve. The warning says what
// to change.
func TestADirectoryThatIsNotPrivateIsReportedAndTheServerRuns(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	require.NoError(t, os.Mkdir(filepath.Join(dir, runtimeSubdir), 0o700))
	// Chmod, not the mode of Mkdir, which the umask would narrow.
	require.NoError(t, os.Chmod(filepath.Join(dir, runtimeSubdir), 0o755))

	sdash, address := serveIn(t, withRuntimeDir(dir), "--no-browser")

	assert.NotEmpty(t, address)
	assert.NoFileExists(t, filepath.Join(dir, runtimeSubdir, launch.RecordFile))
	require.Equal(t, exitOK, sdash.stop())
	assert.Contains(t, sdash.stderr.String(), `level=WARN msg="cannot look for a running sdash"`)
	assert.Contains(t, sdash.stderr.String(), "it must be 0700")
}
