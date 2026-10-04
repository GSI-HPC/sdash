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
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// childEnv makes the test binary act as the process under test: "main" runs
// sdash with the arguments it was given, and "wait" only waits for the first
// signal and then hangs, which is how a shutdown behaves that a request
// holds up.
const childEnv = "SDASH_TEST_PROCESS"

func TestMain(m *testing.M) {
	switch os.Getenv(childEnv) {
	case "main":
		main()
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

// start runs the test binary as the process under test, away from the home
// and the cache of whoever runs the tests.
func start(t *testing.T, mode string, args ...string) *child {
	t.Helper()
	dir := t.TempDir()
	cmd := exec.Command(os.Args[0], args...)
	cmd.Env = append(os.Environ(),
		childEnv+"="+mode,
		"HOME="+dir,
		"XDG_CACHE_HOME="+filepath.Join(dir, "cache"),
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

// expect returns the next line the process prints, which has to start with
// prefix.
func (c *child) expect(t *testing.T, prefix string) string {
	t.Helper()
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

// A signal is the normal way to stop this server, so the first one ends the
// process with exit 0, not with the 130 of a command that was interrupted
// (doc/adr/0020-go-lines-tools-and-libraries.md).
func TestTheFirstSignalStopsTheServerAndExitsZero(t *testing.T) {
	t.Parallel()

	for _, sig := range []os.Signal{os.Interrupt, syscall.SIGTERM} {
		t.Run(sig.String(), func(t *testing.T) {
			t.Parallel()

			sdash := start(t, "main", "--no-browser", "--listen", "127.0.0.1:0")
			sdash.expect(t, "sdash is serving at ")
			require.NoError(t, sdash.cmd.Process.Signal(sig))

			err := sdash.wait(t, 15*time.Second)

			assert.NoError(t, err, "stderr:\n%s", sdash.stderr)
		})
	}
}

// The handler is removed when the first signal arrives. Were it left in
// place, every later signal would be swallowed, and a shutdown that a
// request holds up could not be ended from the terminal at all.
func TestTheSecondSignalEndsAProcessThatDoesNotStop(t *testing.T) {
	t.Parallel()

	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM} {
		t.Run(sig.String(), func(t *testing.T) {
			t.Parallel()

			hung := start(t, "wait")
			hung.expect(t, "ready")
			require.NoError(t, hung.cmd.Process.Signal(sig))
			// The cause is context.Canceled and not the signal, so that
			// every path reports the same cancellation.
			assert.Equal(t, "cancelled: context canceled cause: context canceled",
				hung.expect(t, "cancelled"))
			require.NoError(t, hung.cmd.Process.Signal(sig))

			err := hung.wait(t, 15*time.Second)

			var exit *exec.ExitError
			require.ErrorAs(t, err, &exit, "the process has to be killed by the signal")
			status, ok := exit.Sys().(syscall.WaitStatus)
			require.True(t, ok)
			require.True(t, status.Signaled(), "the process ended with %v, want it killed by the signal", exit)
			assert.Equal(t, sig, status.Signal())
		})
	}
}
