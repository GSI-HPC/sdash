// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package cli defines the sdash command line: the root command, which runs
// the server, and "version".
//
// It is the one place where the program meets its process. The arguments,
// the streams, the environment and the desktop arrive in a Process, and the
// logger is built here from the -v flag and handed down; no package below
// reads os.Args, os.Stderr or slog.Default, so each can be driven by a test
// with fakes.
package cli

import (
	"context"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"

	"github.com/spf13/cobra"

	"github.com/GSI-HPC/go-clikit/cobratree"
	"github.com/GSI-HPC/go-clikit/localweb/launch"
	"github.com/GSI-HPC/go-clikit/termtext"
	"github.com/GSI-HPC/sdash/internal/server"
)

// The exit codes of sdash. Scripts and service managers branch on them, so
// they may be added to but never renumbered.
const (
	// exitOK means sdash did what it was asked. A server that SIGINT, SIGTERM
	// or SIGHUP stopped exits exitOK after a clean shutdown: a signal is the
	// normal way to stop it, where a command that runs to an end would
	// report 130.
	exitOK = 0
	// exitFailure means the command line was accepted and sdash then could
	// not do its work: the listener could not be opened, or the shutdown had
	// to cut requests off.
	exitFailure = 1
	// exitUsage means the command line or the configuration was rejected
	// before anything was started.
	exitUsage = 2
)

// defaultListen is where sdash listens unless told otherwise: its port on
// both loopback addresses, which is what lets the server answer to the name
// localhost as well (doc/adr/0023-the-listeners-as-built.md).
const defaultListen = "localhost:" + server.DefaultPort

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
	// Browser opens the address of the server on the user's desktop. Its
	// Dir is left empty: the redirect file lies below CacheDir.
	Browser launch.Opener
	// CacheDir returns the user's cache directory, as os.UserCacheDir does.
	// Without it no browser is opened.
	CacheDir func() (string, error)
	// Getenv reads a variable of the environment, as os.Getenv does. Without
	// it nothing is set.
	Getenv func(string) string
	// Hostname returns the name of the machine, as os.Hostname does. Without
	// it the name is unknown.
	Hostname func() (string, error)
	// Getuid returns the ID of the user, as os.Getuid does. Without it the
	// server does not look at whose a connection is.
	Getuid func() int
}

// options are the flags of the root command.
type options struct {
	// listen says where to listen: a loopback host and a port, or a unix
	// socket.
	listen string
	// noBrowser keeps sdash from opening a browser.
	noBrowser bool
	// dev serves the interface from web/dist on disk and accepts the
	// requests the Vite dev server proxies.
	dev bool
	// readOnly has sdash send nothing that changes a cluster: the server
	// refuses every request that could.
	readOnly bool
	// verbosity counts the -v flags.
	verbosity int
	// ownServer is set when the command line asks for a server of its own:
	// it names --listen, --dev or --read-only. Such a start neither looks
	// for the sdash that runs already nor leaves a record for the next
	// one (doc/adr/0028-one-sdash-server-per-user.md).
	ownServer bool
}

// serveFunc runs the server with the flags of the root command. It is a
// parameter of newRootCommand so that a test can read the parsed flags
// without a listener being opened.
type serveFunc func(ctx context.Context, p Process, o options) error

// Execute runs the command line of the process and returns its exit code
// (exitOK, exitFailure and exitUsage). ctx is cancelled by the signal that stops the server.
func Execute(ctx context.Context) int {
	return run(ctx, Process{
		Args:   os.Args[1:],
		Stdout: os.Stdout,
		Stderr: os.Stderr,
		Browser: launch.Opener{
			Name:   "sdash",
			GOOS:   runtime.GOOS,
			Getenv: os.Getenv,
		},
		CacheDir: os.UserCacheDir,
		Getenv:   os.Getenv,
		Hostname: os.Hostname,
		Getuid:   os.Getuid,
	}, serve)
}

// run executes the command tree in p, with serve as what the root command
// does, and returns the exit code. The error a command ends with is printed
// here and nowhere else, so that it appears once.
func run(ctx context.Context, p Process, serve serveFunc) int {
	cmd := newRootCommand(p, serve)
	if err := cmd.ExecuteContext(ctx); err != nil {
		// The exit code is what a caller acts on; a message that cannot
		// be written changes nothing about it. An error can quote text
		// from outside, such as an argument or a path, which must not move
		// the cursor or retitle the terminal.
		_, _ = fmt.Fprintf(p.Stderr, "sdash: %s\n", termtext.Escape(err.Error()))
		if cobratree.IsUsage(err) {
			return exitUsage
		}
		return exitFailure
	}
	return exitOK
}

// newRootCommand builds the command tree on the streams and arguments of p.
func newRootCommand(p Process, serve serveFunc) *cobra.Command {
	var o options
	cmd := &cobra.Command{
		Use:   "sdash",
		Short: "Serve a dashboard for Slurm clusters to a browser on this machine",
		Long: strings.TrimSpace(`
sdash serves its user interface on the loopback addresses of this machine,
prints its address and opens it in a browser. It runs until it is
interrupted or its terminal hangs up, and exits 0 after a clean shutdown.

Only one sdash serves each user. Started again, it prints the address of the
one that runs, opens the browser on it and exits 0. A start with --listen,
--dev or --read-only asks for a server of its own and is left alone.

The printed address holds a token that signs the browser in. Whoever has it
acts as you for as long as this sdash runs, so treat it like a password.

On a host you share with other users, listen on a unix socket and not on a
port: --listen unix:PATH, or --listen unix: for a socket in your runtime
directory. Every user of the host can connect to a loopback port; only you
can connect to the socket. sdash then opens no browser. It prints an ssh
command that forwards a port of your own machine to the socket, and the
address to open there. It refuses a PATH under which another user could put
a socket of their own: one in a directory that others may write to, or
below a directory in which others may rename what is yours.`),
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			for _, name := range []string{"listen", "dev", "read-only"} {
				o.ownServer = o.ownServer || cmd.Flags().Changed(name)
			}
			return serve(cmd.Context(), p, o)
		},
	}
	// cobra reads os.Args when it is given nil arguments, and a Process
	// without arguments must mean none.
	cmd.SetArgs(append([]string{}, p.Args...))
	cmd.SetOut(p.Stdout)
	cmd.SetErr(p.Stderr)
	// The flags belong to the root command alone: "sdash version --listen"
	// is a mistake worth reporting, not a flag to ignore.
	flags := cmd.Flags()
	flags.StringVar(&o.listen, "listen", defaultListen,
		"where to listen: host:port on loopback (localhost is 127.0.0.1 and ::1; a port that is taken is replaced "+
			"by a free one, which is logged), or unix:PATH for a unix socket and no port (unix: alone is "+
			"$XDG_RUNTIME_DIR/sdash/sdash.sock)")
	flags.BoolVar(&o.noBrowser, "no-browser", false,
		"do not open a browser; the address is printed in any case")
	flags.BoolVar(&o.dev, "dev", false,
		"development: serve the interface from web/dist on disk and accept requests the Vite dev server proxies")
	flags.BoolVar(&o.readOnly, "read-only", false,
		"send nothing that changes a cluster: every request of the interface that could is refused")
	flags.CountVarP(&o.verbosity, "verbose", "v",
		"log more to standard error: -v adds what sdash does, -vv every request (default: warnings and errors)")

	// A value that a flag cannot parse is worded by the flag's type, as
	// "invalid --no-browser value \"x\": want true or false". The root's
	// function serves every command below it.
	cmd.SetFlagErrorFunc(cobratree.FlagError)

	cmd.AddCommand(newVersionCommand(p))
	// Every error of the command line is a usage error, which run maps to
	// exitUsage: a flag that cannot be parsed, an argument check, and a word
	// that names no command.
	cobratree.Strict(cmd, nil)
	return cmd
}
