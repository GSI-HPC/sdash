// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build linux

package cli

import (
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/go-clikit/localweb/launch"
)

// runningElsewhere stands in for the sdash of an earlier start: a process
// that lives, and a listener of the user's at the address of its record. It
// returns the runtime directory the record lies in and the address in it.
// The tests of the processes themselves are in cmd/sdash; here the other
// process has to be one that is not the test's own, since a start never
// takes its own record for a running server.
func runningElsewhere(t *testing.T) (dir, address string) {
	t.Helper()
	other := exec.Command("sleep", "60")
	require.NoError(t, other.Start())
	t.Cleanup(func() {
		_ = other.Process.Kill()
		_ = other.Wait()
	})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	dir = t.TempDir()
	require.NoError(t, os.Mkdir(filepath.Join(dir, runtimeSubdir), 0o700))
	address = "http://" + listener.Addr().String() + "/?token=TOKEN"
	writeRecord(t, dir, launch.Record{URL: address, PID: other.Process.Pid})
	return dir, address
}

// writeRecord writes record as an sdash that runs would.
func writeRecord(t *testing.T, dir string, record launch.Record) {
	t.Helper()
	data, err := json.Marshal(record)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, runtimeSubdir, launch.RecordFile), data, 0o600))
}

// The second start of sdash is what the user does when they have lost the
// tab: it says where the server is, opens the browser on it and ends. It
// starts no server, so there is nothing to stop and nothing it leaves.
func TestASecondStartOpensTheBrowserOnTheRunningServerAndEnds(t *testing.T) {
	t.Parallel()

	dir, address := runningElsewhere(t)
	d := newDesktop(t, withDisplay(), nil)
	stdout, stderr := &output{}, &output{}

	code := runToItsEnd(t, Process{
		Stdout: stdout, Stderr: stderr,
		Getenv: withRuntimeDir(dir), Browser: d.Opener, CacheDir: d.cacheDir,
	})

	assert.Equal(t, exitOK, code)
	assert.Equal(t, "sdash is serving at "+address+"\n", stdout.String())
	assert.Empty(t, stderr.String())
	started := d.await(t)
	require.Len(t, started, 2)
	assert.Equal(t, "xdg-open", started[0])
	page, err := os.ReadFile(started[1])
	require.NoError(t, err)
	assert.Contains(t, string(page), address)
	// The file is the running server's, which removes it when it stops.
	assert.FileExists(t, started[1])
}

// With --no-browser the second start only says where the server is.
func TestASecondStartWithNoBrowserOnlySaysWhereTheServerIs(t *testing.T) {
	t.Parallel()

	dir, address := runningElsewhere(t)
	d := newDesktop(t, withDisplay(), nil)
	stdout := &output{}

	code := runToItsEnd(t, Process{
		Args: []string{"--no-browser"}, Stdout: stdout, Stderr: &output{},
		Getenv: withRuntimeDir(dir), Browser: d.Opener, CacheDir: d.cacheDir,
	})

	assert.Equal(t, exitOK, code)
	assert.Equal(t, "sdash is serving at "+address+"\n", stdout.String())
	assert.Empty(t, d.opened, "the opener was not started")
}

// A record that nothing stands behind is no server: the process of it has
// ended, as after a kill or a crash.
func TestARecordOfAProcessThatHasEndedIsNoServer(t *testing.T) {
	t.Parallel()

	dir, _ := runningElsewhere(t)
	ended := exec.Command("true")
	require.NoError(t, ended.Run())
	writeRecord(t, dir, launch.Record{URL: "http://127.0.0.1:7374/?token=OLD", PID: ended.Process.Pid})

	sdash, address := serveIn(t, withRuntimeDir(dir), "--no-browser")

	assert.NotContains(t, address, "token=OLD")
	assert.Equal(t, address, readRecord(t, dir).URL, "the new server's record replaced the old one")
	require.Equal(t, exitOK, sdash.stop())
}
