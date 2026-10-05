// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Command sdash serves a dashboard for Slurm clusters to a browser on the
// machine it runs on: one binary that holds the user interface and speaks to
// a cluster's slurmrestd as the user who started it
// (doc/adr/0001-local-first-binary-with-embedded-ui.md).
//
// Adapted from GSI-HPC/clusterctl cmd/clusterctl/main.go.
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/GSI-HPC/sdash/internal/cli"
)

func main() {
	ctx, stop := interruptContext()
	code := cli.Execute(ctx)
	stop()
	os.Exit(code)
}

// interruptContext returns a context that the first of the signals that
// stop the server cancels (stopSignals). A signal is the normal way to stop
// this server: the listener closes, the requests in flight get a moment to
// finish, and the process exits 0 (internal/exitcode).
//
// The handler is removed as soon as the first signal arrives, so a second
// one gets the default action and ends the process at once, even while a
// request that does not finish holds the shutdown up. The context's cause is
// context.Canceled, not the signal, so that every path reports the same
// cancellation.
func interruptContext() (context.Context, func()) {
	ctx, cancel := context.WithCancel(context.Background())
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, stopSignals()...)
	done := make(chan struct{})
	go func() {
		select {
		case <-signals:
		case <-done:
		}
		signal.Stop(signals)
		cancel()
	}()
	return ctx, func() { close(done) }
}

// stopSignals returns the signals that stop the server: SIGINT, SIGTERM
// and, unless the process was started to ignore it, SIGHUP.
//
// SIGHUP is among them because of where sdash runs on a shared host: in an
// ssh session, whose ordinary end is that it closes, and then the terminal
// hangs up. Left to its default action, that signal would end the process
// before it has removed its unix socket, and the file would stay behind
// (doc/adr/0023-the-listeners-as-built.md).
//
// A process started under nohup has the hangup ignored, and asking to be
// told of the signal would undo that: package signal puts a handler in the
// place of the ignoring. Whoever starts sdash that way wants it to outlive
// the terminal, so the signal is then left as it is.
func stopSignals() []os.Signal {
	stops := []os.Signal{os.Interrupt, syscall.SIGTERM}
	if !signal.Ignored(syscall.SIGHUP) {
		stops = append(stops, syscall.SIGHUP)
	}
	return stops
}
