// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package cli defines the sdash command line: the root command, which runs
// the server, and "version".
//
// It is the one place where the program meets its process. The arguments,
// the streams and the desktop arrive in a Process, and the logger is built
// here from the -v flag and handed down; no package below reads os.Args,
// os.Stderr or slog.Default, so each can be driven by a test with fakes.
package cli

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/GSI-HPC/sdash/internal/browser"
	"github.com/GSI-HPC/sdash/internal/exitcode"
)

// defaultListen is where sdash listens unless told otherwise
// (doc/adr/0012-local-listener-security.md).
const defaultListen = "127.0.0.1:7374"

// Process is what the command line takes from the process it runs in.
// Execute fills it from package os; a test fills it with fakes.
type Process struct {
	// Args are the command line arguments without the program's name.
	Args []string
	// Stdout receives what a command is asked for: the address of the
	// server, the version.
	Stdout io.Writer
	// Stderr receives the log and the error a command ends with.
	Stderr io.Writer
	// Browser opens the address of the server on the user's desktop.
	Browser browser.Opener
}

// options are the flags of the root command.
type options struct {
	// listen is the address to bind.
	listen string
	// noBrowser keeps sdash from opening a browser.
	noBrowser bool
	// dev serves the interface from web/dist on disk and accepts the
	// requests the Vite dev server proxies.
	dev bool
	// readOnly asks sdash to send nothing that changes a cluster.
	readOnly bool
	// verbosity counts the -v flags.
	verbosity int
}

// serveFunc runs the server with the flags of the root command. It is a
// parameter of newRootCommand so that a test can read the parsed flags
// without a listener being opened.
type serveFunc func(ctx context.Context, p Process, o options) error

// Execute runs the command line of the process and returns its exit code
// (internal/exitcode). ctx is cancelled by the signal that stops the server.
func Execute(ctx context.Context) int {
	return run(ctx, Process{
		Args:    os.Args[1:],
		Stdout:  os.Stdout,
		Stderr:  os.Stderr,
		Browser: browser.System(),
	}, serve)
}

// run executes the command tree in p, with serve as what the root command
// does, and returns the exit code. The error a command ends with is printed
// here and nowhere else, so that it appears once.
func run(ctx context.Context, p Process, serve serveFunc) int {
	cmd := newRootCommand(p, serve)
	if err := cmd.ExecuteContext(ctx); err != nil {
		// The exit code is what a caller acts on; a message that cannot
		// be written changes nothing about it.
		_, _ = fmt.Fprintf(p.Stderr, "sdash: %s\n", err)
		return exitcode.From(err)
	}
	return exitcode.OK
}

// newRootCommand builds the command tree on the streams and arguments of p.
func newRootCommand(p Process, serve serveFunc) *cobra.Command {
	var o options
	cmd := &cobra.Command{
		Use:   "sdash",
		Short: "Serve a dashboard for Slurm clusters to a browser on this machine",
		Long: strings.TrimSpace(`
sdash serves its user interface on a loopback address, prints that address
and opens it in a browser. It runs until it is interrupted, and exits 0 after
a clean shutdown.

The printed address holds a token that signs the browser in. Whoever has it
acts as you for as long as this sdash runs, so treat it like a password.`),
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return serve(cmd.Context(), p, o)
		},
	}
	// cobra reads os.Args when it is given nil arguments, and a Process
	// without arguments must mean none.
	cmd.SetArgs(append([]string{}, p.Args...))
	cmd.SetOut(p.Stdout)
	cmd.SetErr(p.Stderr)
	// A flag that cannot be parsed is a usage error, whichever command it
	// was given to: the subcommands ask their parent for this function.
	cmd.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
		return exitcode.Wrap(exitcode.Usage, err)
	})

	// The flags belong to the root command alone: "sdash version --listen"
	// is a mistake worth reporting, not a flag to ignore.
	flags := cmd.Flags()
	flags.StringVar(&o.listen, "listen", defaultListen,
		"loopback address to listen on, as host:port; when the port is taken a free one is used and logged")
	flags.BoolVar(&o.noBrowser, "no-browser", false,
		"do not open a browser; the address is printed in any case")
	flags.BoolVar(&o.dev, "dev", false,
		"development: serve the interface from web/dist on disk and accept requests the Vite dev server proxies")
	flags.BoolVar(&o.readOnly, "read-only", false,
		"send nothing that changes a cluster")
	flags.CountVarP(&o.verbosity, "verbose", "v",
		"log more to standard error: -v adds what sdash does, -vv every request (default: warnings and errors)")

	cmd.AddCommand(newVersionCommand(p))
	usageArgs(cmd)
	return cmd
}

// usageArgs makes every argument check in the tree report a usage error.
// cobra's own checks, such as cobra.NoArgs, return plain errors, which would
// otherwise exit 1, the code for a server that failed.
//
// Adapted from GSI-HPC/clusterctl internal/cli/root.go.
func usageArgs(cmd *cobra.Command) {
	if check := cmd.Args; check != nil {
		cmd.Args = func(c *cobra.Command, args []string) error {
			return exitcode.Wrap(exitcode.Usage, check(c, args))
		}
	}
	for _, sub := range cmd.Commands() {
		usageArgs(sub)
	}
}
