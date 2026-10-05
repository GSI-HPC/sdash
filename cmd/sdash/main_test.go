// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Adapted from GSI-HPC/clusterctl cmd/clusterctl/signal_test.go.

package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/server"
	"github.com/GSI-HPC/sdash/internal/server/servertest"
)

// childEnv makes the test binary act as the process under test: "main" runs
// sdash with the arguments it was given, "wait" only waits for the first
// signal and then hangs, which is how a shutdown behaves that a request
// holds up, and "signals" says which signals would stop it.
const childEnv = "SDASH_TEST_PROCESS"

func TestMain(m *testing.M) {
	switch os.Getenv(childEnv) {
	case "main":
		main()
	case "signals":
		fmt.Println("stops on:", stopSignals())
		os.Exit(0)
	case "wait":
		ctx, _ := interruptContext()
		fmt.Println("ready")
		<-ctx.Done()
		fmt.Println("cancelled:", ctx.Err(), "cause:", context.Cause(ctx))
		time.Sleep(time.Minute)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// child is the test binary started as the process under test.
type child struct {
	cmd    *exec.Cmd
	stdout *bufio.Scanner
	stderr *bytes.Buffer
}

// start runs the test binary as the process under test, away from the
// home, the cache and the cluster profiles of whoever runs the tests.
func start(t *testing.T, mode string, args ...string) *child {
	t.Helper()
	return startThrough(t, mode, os.Args[0], args...)
}

// startThrough is start with the command that is run, which is the test
// binary or a program that starts it, as nohup does.
func startThrough(t *testing.T, mode, name string, args ...string) *child {
	t.Helper()
	dir := t.TempDir()
	cmd := exec.Command(name, args...)
	cmd.Env = append(os.Environ(),
		childEnv+"="+mode,
		"HOME="+dir,
		"XDG_CACHE_HOME="+filepath.Join(dir, "cache"),
		"XDG_CONFIG_HOME="+filepath.Join(dir, "config"),
		"SDASH_CONFIG=",
	)
	stderr := &bytes.Buffer{}
	cmd.Stderr = stderr
	stdout, err := cmd.StdoutPipe()
	require.NoError(t, err)
	require.NoError(t, cmd.Start())
	// A test that fails before the process has ended must not leave it
	// running. Killing one that has ended, or waiting for it twice, fails
	// and changes nothing.
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	})
	return &child{cmd: cmd, stdout: bufio.NewScanner(stdout), stderr: stderr}
}

// patience is how long a step of the process under test may take: printing
// its next line, or ending after a signal. It is far more than either needs,
// and what it is for is the step that never happens.
const patience = 15 * time.Second

// expect returns the next line the process prints, which has to start with
// prefix. A process that neither prints a line nor ends is killed after
// patience, which ends its output and fails the test here, where a bare
// read would hang.
func (c *child) expect(t *testing.T, prefix string) string {
	t.Helper()
	silent := time.AfterFunc(patience, func() { _ = c.cmd.Process.Kill() })
	defer silent.Stop()
	require.True(t, c.stdout.Scan(), "the process printed nothing more; stderr:\n%s", c.stderr)
	require.True(t, strings.HasPrefix(c.stdout.Text(), prefix),
		"the process said %q, want a line starting with %q", c.stdout.Text(), prefix)
	return c.stdout.Text()
}

// wait returns how the process ended. A process that is still running after
// d fails the test, where a bare wait would hang.
func (c *child) wait(t *testing.T, d time.Duration) error {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- c.cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(d):
		_ = c.cmd.Process.Kill()
		<-done
		require.FailNowf(t, "the process did not end",
			"still running %v after the signal; stderr:\n%s", d, c.stderr)
		return nil
	}
}

// arrives fails a test that sends sig where the signal cannot arrive: the
// tests themselves were started with the hangup ignored, as under nohup,
// and the process under test inherits that. Such a test would show how it
// was run and not what sdash does, after a long wait.
func arrives(t *testing.T, sig os.Signal) {
	t.Helper()
	if sig == syscall.SIGHUP {
		require.False(t, signal.Ignored(syscall.SIGHUP),
			"the tests were started with SIGHUP ignored, as under nohup; run them without it")
	}
}

// A signal is the normal way to stop this server, so the first one ends the
// process with exit 0, not with the 130 of a command that was interrupted
// (doc/adr/0020-go-lines-tools-and-libraries.md). The hangup of a terminal
// is such a signal too (doc/adr/0023-the-listeners-as-built.md).
func TestTheFirstSignalStopsTheServerAndExitsZero(t *testing.T) {
	t.Parallel()

	for _, sig := range []os.Signal{os.Interrupt, syscall.SIGTERM, syscall.SIGHUP} {
		t.Run(sig.String(), func(t *testing.T) {
			t.Parallel()
			arrives(t, sig)

			sdash := start(t, "main", "--no-browser", "--listen", "127.0.0.1:0")
			sdash.expect(t, "sdash is serving at ")
			require.NoError(t, sdash.cmd.Process.Signal(sig))

			err := sdash.wait(t, patience)

			assert.NoError(t, err, "stderr:\n%s", sdash.stderr)
		})
	}
}

// On a shared host sdash listens on a unix socket and runs in an ssh
// session, and the ordinary end of it is that the session closes: the
// terminal hangs up. Left to its default action, the hangup would end the
// process where it stands, and the socket file would stay behind for
// whoever looks to take for a server.
func TestAHangupStopsAServerOnASocketWhichRemovesTheSocket(t *testing.T) {
	t.Parallel()
	arrives(t, syscall.SIGHUP)

	dir := servertest.SocketDir(t, func(dir string) bool {
		return server.CheckListen(server.UnixScheme+filepath.Join(dir, "sdash.sock")) == nil
	})
	path := filepath.Join(dir, "sdash.sock")
	sdash := start(t, "main", "--listen", server.UnixScheme+path)
	sdash.expect(t, "sdash is serving on the unix socket "+path)
	require.FileExists(t, path)
	require.NoError(t, sdash.cmd.Process.Signal(syscall.SIGHUP))

	err := sdash.wait(t, patience)

	assert.NoError(t, err, "stderr:\n%s", sdash.stderr)
	assert.NoFileExists(t, path)
}

// nohup is how a user keeps a program running past the end of a session: it
// starts the program with the hangup ignored. Asking to be told of a signal
// puts a handler in the place of the ignoring, so sdash must not ask for
// this one then, or the hangup would stop what was started to outlive it.
func TestAHangupThatSdashWasStartedToIgnoreIsNotAmongTheSignalsThatStopIt(t *testing.T) {
	t.Parallel()
	arrives(t, syscall.SIGHUP)

	started := start(t, "signals")
	assert.Equal(t, "stops on: [interrupt terminated hangup]", started.expect(t, "stops on:"))
	require.NoError(t, started.wait(t, patience))

	underNohup := startThrough(t, "signals", "nohup", os.Args[0])
	assert.Equal(t, "stops on: [interrupt terminated]", underNohup.expect(t, "stops on:"))
	require.NoError(t, underNohup.wait(t, patience))
}

// The handler is removed when the first signal arrives. Were it left in
// place, every later signal would be swallowed, and a shutdown that a
// request holds up could not be ended from the terminal at all.
func TestTheSecondSignalEndsAProcessThatDoesNotStop(t *testing.T) {
	t.Parallel()

	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP} {
		t.Run(sig.String(), func(t *testing.T) {
			t.Parallel()
			arrives(t, sig)

			hung := start(t, "wait")
			hung.expect(t, "ready")
			require.NoError(t, hung.cmd.Process.Signal(sig))
			// The cause is context.Canceled and not the signal, so that
			// every path reports the same cancellation.
			assert.Equal(t, "cancelled: context canceled cause: context canceled",
				hung.expect(t, "cancelled"))
			require.NoError(t, hung.cmd.Process.Signal(sig))

			err := hung.wait(t, patience)

			var exit *exec.ExitError
			require.ErrorAs(t, err, &exit, "the process has to be killed by the signal")
			status, ok := exit.Sys().(syscall.WaitStatus)
			require.True(t, ok)
			require.True(t, status.Signaled(), "the process ended with %v, want it killed by the signal", exit)
			assert.Equal(t, sig, status.Signal())
		})
	}
}
