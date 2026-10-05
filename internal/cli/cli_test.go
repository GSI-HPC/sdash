// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/exitcode"
	"github.com/GSI-HPC/sdash/internal/version"
)

// output collects what a command writes while a test reads it.
type output struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (o *output) Write(p []byte) (int, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.buf.Write(p)
}

func (o *output) String() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.buf.String()
}

// parse runs the command line args with a server that only records the
// flags it was started with, and returns them with the exit code.
func parse(t *testing.T, args ...string) (options, int, *output) {
	t.Helper()
	var got options
	stderr := &output{}
	code := run(t.Context(), Process{Args: args, Stdout: &output{}, Stderr: stderr},
		func(_ context.Context, _ Process, o options) error {
			got = o
			return nil
		})
	return got, code, stderr
}

// The defaults are part of the command line contract: the address a user
// has bookmarked, and a browser that opens without being asked for.
func TestWithoutFlagsTheServerRunsOnItsDefaults(t *testing.T) {
	t.Parallel()

	got, code, stderr := parse(t)

	assert.Equal(t, exitcode.OK, code)
	assert.Empty(t, stderr.String())
	assert.Equal(t, options{listen: "localhost:7374"}, got)
}

func TestEachFlagReachesTheServer(t *testing.T) {
	t.Parallel()

	defaults := options{listen: "localhost:7374"}
	with := func(change func(*options)) options {
		o := defaults
		change(&o)
		return o
	}
	tests := []struct {
		name string
		args []string
		want options
	}{
		{name: "another address", args: []string{"--listen", "[::1]:8000"}, want: with(func(o *options) { o.listen = "[::1]:8000" })},
		{name: "another address with =", args: []string{"--listen=127.0.0.1:0"}, want: with(func(o *options) { o.listen = "127.0.0.1:0" })},
		{name: "a unix socket", args: []string{"--listen", "unix:/run/user/1000/sdash.sock"}, want: with(func(o *options) { o.listen = "unix:/run/user/1000/sdash.sock" })},
		{name: "the default unix socket", args: []string{"--listen", "unix:"}, want: with(func(o *options) { o.listen = "unix:" })},
		{name: "no browser", args: []string{"--no-browser"}, want: with(func(o *options) { o.noBrowser = true })},
		{name: "development", args: []string{"--dev"}, want: with(func(o *options) { o.dev = true })},
		{name: "read-only", args: []string{"--read-only"}, want: with(func(o *options) { o.readOnly = true })},
		{name: "a configuration directory", args: []string{"--config", "/srv/sdash"}, want: with(func(o *options) { o.config = "/srv/sdash" })},
		{name: "one -v", args: []string{"-v"}, want: with(func(o *options) { o.verbosity = 1 })},
		{name: "-v twice in one word", args: []string{"-vv"}, want: with(func(o *options) { o.verbosity = 2 })},
		{name: "-v twice in two words", args: []string{"-v", "-v"}, want: with(func(o *options) { o.verbosity = 2 })},
		{name: "the long form of -v", args: []string{"--verbose", "--verbose", "--verbose"}, want: with(func(o *options) { o.verbosity = 3 })},
		{
			name: "all of them",
			args: []string{"--dev", "--no-browser", "--read-only", "-vv", "--listen", "127.0.0.1:0"},
			want: options{listen: "127.0.0.1:0", noBrowser: true, dev: true, readOnly: true, verbosity: 2},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, code, stderr := parse(t, tt.args...)

			assert.Equal(t, exitcode.OK, code)
			assert.Empty(t, stderr.String())
			assert.Equal(t, tt.want, got)
		})
	}
}

// A command line that is not understood must start nothing and exit 2, so
// that a script or a service unit tells a mistake of its own from a server
// that failed.
func TestAMistakeOnTheCommandLineIsAUsageError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		args []string
		says string
	}{
		{name: "an unknown flag", args: []string{"--nonsense"}, says: "unknown flag: --nonsense"},
		{name: "a flag without its value", args: []string{"--listen"}, says: "flag needs an argument: --listen"},
		{name: "an argument the root command does not take", args: []string{"serve"}, says: `unknown command "serve" for "sdash"`},
		{name: "an argument version does not take", args: []string{"version", "extra"}, says: `unknown command "extra" for "sdash version"`},
		{name: "an unknown flag of version", args: []string{"version", "--nonsense"}, says: "unknown flag: --nonsense"},
		{
			// The flags of the server are not flags of every command.
			name: "a flag of the server given to version",
			args: []string{"version", "--listen", "127.0.0.1:0"},
			says: "unknown flag: --listen",
		},
		{name: "a command config does not have", args: []string{"config", "chekc"}, says: `unknown command "chekc" for "sdash config"`},
		{name: "an argument config check does not take", args: []string{"config", "check", "vesta.yaml"}, says: `unknown command "vesta.yaml" for "sdash config check"`},
		{name: "a flag of the server given to config check", args: []string{"config", "check", "--read-only"}, says: "unknown flag: --read-only"},
		{name: "--config without its value", args: []string{"config", "check", "--config"}, says: "flag needs an argument: --config"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			started := false
			stdout, stderr := &output{}, &output{}
			code := run(t.Context(), Process{Args: tt.args, Stdout: stdout, Stderr: stderr},
				func(context.Context, Process, options) error {
					started = true
					return nil
				})

			assert.Equal(t, exitcode.Usage, code)
			assert.False(t, started, "nothing is started")
			assert.Equal(t, "sdash: "+tt.says+"\n", stderr.String())
			assert.Empty(t, stdout.String())
		})
	}
}

// An address that is not this machine's own is a mistake on the command
// line like any other, although only the server can tell: it exits 2 and
// opens nothing.
func TestAnAddressBeyondThisMachineIsAUsageError(t *testing.T) {
	t.Parallel()

	for _, addr := range []string{"0.0.0.0:7374", ":7374", "192.0.2.10:7374", "127.0.0.1", "nonsense"} {
		t.Run(addr, func(t *testing.T) {
			t.Parallel()

			stdout, stderr := &output{}, &output{}

			code := run(t.Context(), Process{
				Args:   []string{"--listen", addr, "--no-browser"},
				Stdout: stdout,
				Stderr: stderr,
			}, serve)

			assert.Equal(t, exitcode.Usage, code)
			assert.True(t, strings.HasPrefix(stderr.String(), "sdash: --listen: "), stderr.String())
			assert.Empty(t, stdout.String(), "no address is printed")
		})
	}
}

// A unix socket that cannot be named is a mistake on the command line too,
// and is reported with what to do about it.
func TestASocketThatCannotBeNamedIsAUsageError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		listen string
		env    map[string]string
		says   string
	}{
		{
			// The default socket lies in the runtime directory, which
			// macOS and a session without a login manager do not have.
			name:   "the default socket without a runtime directory",
			listen: "unix:",
			says: `sdash: --listen: "unix:" names no socket, and XDG_RUNTIME_DIR, where the default one would lie, ` +
				"is not set; name one, as in unix:/path/to/sdash.sock\n",
		},
		{
			// The XDG Base Directory specification has a relative path in
			// the variable ignored. Taken as it is, it would put the socket
			// below the directory sdash happened to be started in.
			name:   "the default socket with a relative runtime directory",
			listen: "unix:",
			env:    map[string]string{"XDG_RUNTIME_DIR": "run/user/1000"},
			says: `sdash: --listen: "unix:" names no socket, and XDG_RUNTIME_DIR, where the default one would lie, ` +
				`is "run/user/1000": a relative path, which is not valid there and counts as not set; ` +
				"name one, as in unix:/path/to/sdash.sock\n",
		},
		{
			// "unix:~/run/sdash.sock" reaches sdash with the ~ in it, and
			// would otherwise create a directory of that name.
			name:   "a home directory the shell did not expand",
			listen: "unix:~/run/sdash.sock",
			says: `sdash: --listen: the shell has left the ~ in "unix:~/run/sdash.sock" as it is; ` +
				"write the directory out, as in unix:$HOME/sdash.sock\n",
		},
		{
			name:   "a path that is too long for a socket",
			listen: "unix:/" + strings.Repeat("long/", 30) + "sdash.sock",
			says:   "bytes long, and a unix socket on this system takes",
		},
		{
			name:   "a default socket that is too long",
			listen: "unix:",
			env:    map[string]string{"XDG_RUNTIME_DIR": "/" + strings.Repeat("long/", 30)},
			says:   "bytes long, and a unix socket on this system takes",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stdout, stderr := &output{}, &output{}

			code := runToItsEnd(t, Process{
				Args:   []string{"--listen", tt.listen},
				Stdout: stdout,
				Stderr: stderr,
				Getenv: func(name string) string { return tt.env[name] },
			})

			assert.Equal(t, exitcode.Usage, code)
			assert.True(t, strings.HasPrefix(stderr.String(), "sdash: --listen: "), stderr.String())
			assert.Contains(t, stderr.String(), tt.says)
			assert.Empty(t, stdout.String(), "nothing is printed to open")
		})
	}
}

// The error a server ends with is printed once, with the program's name,
// and turns into the exit code; a server that ends without one exits 0.
func TestTheErrorOfTheServerBecomesTheExitCode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		err    error
		code   int
		stderr string
	}{
		{name: "a clean stop", err: nil, code: exitcode.OK},
		{name: "a failure", err: errors.New("open the listener: permission denied"), code: exitcode.Failure, stderr: "sdash: open the listener: permission denied\n"},
		{name: "a failure that names its code", err: exitcode.Wrap(exitcode.Usage, errors.New("no such profile")), code: exitcode.Usage, stderr: "sdash: no such profile\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stderr := &output{}

			code := run(t.Context(), Process{Stdout: &output{}, Stderr: stderr},
				func(context.Context, Process, options) error { return tt.err })

			assert.Equal(t, tt.code, code)
			assert.Equal(t, tt.stderr, stderr.String())
		})
	}
}

func TestVersionPrintsTheProvenanceOnOneLine(t *testing.T) {
	t.Parallel()

	stdout, stderr := &output{}, &output{}

	code := run(t.Context(), Process{Args: []string{"version"}, Stdout: stdout, Stderr: stderr}, serve)

	assert.Equal(t, exitcode.OK, code)
	assert.Equal(t, version.Get().String()+"\n", stdout.String())
	assert.Empty(t, stderr.String())
}

// --json is for a script, or a bug report, that wants the fields apart.
func TestVersionAsJSONHoldsTheSameProvenance(t *testing.T) {
	t.Parallel()

	stdout, stderr := &output{}, &output{}

	code := run(t.Context(), Process{Args: []string{"version", "--json"}, Stdout: stdout, Stderr: stderr}, serve)

	require.Equal(t, exitcode.OK, code)
	assert.Empty(t, stderr.String())
	var got version.Info
	require.NoError(t, json.Unmarshal([]byte(stdout.String()), &got))
	assert.Equal(t, version.Get(), got)
	// The names are what a script reads.
	assert.Contains(t, stdout.String(), `"version": `)
	assert.Contains(t, stdout.String(), `"goVersion": `)
	assert.Contains(t, stdout.String(), `"platform": `)
}

// A terminal should show the address and what needs attention; -v and -vv
// are for the user who wants to see sdash work.
func TestTheNumberOfVFlagsSetsTheLogLevel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		verbosity int
		shown     []string
		hidden    []string
	}{
		{verbosity: 0, shown: []string{"level=ERROR", "level=WARN"}, hidden: []string{"level=INFO", "level=DEBUG"}},
		{verbosity: 1, shown: []string{"level=ERROR", "level=WARN", "level=INFO"}, hidden: []string{"level=DEBUG"}},
		{verbosity: 2, shown: []string{"level=ERROR", "level=WARN", "level=INFO", "level=DEBUG"}},
		{verbosity: 5, shown: []string{"level=ERROR", "level=WARN", "level=INFO", "level=DEBUG"}},
	}
	for _, tt := range tests {
		t.Run(strings.Repeat("v", tt.verbosity), func(t *testing.T) {
			t.Parallel()

			var log bytes.Buffer
			logger := newLogger(&log, tt.verbosity)
			logger.Error("an error")
			logger.Warn("a warning")
			logger.Info("a step")
			logger.Debug("a request")

			for _, level := range tt.shown {
				assert.Contains(t, log.String(), level)
			}
			for _, level := range tt.hidden {
				assert.NotContains(t, log.String(), level)
			}
		})
	}
}

// The logger is handed down, never installed: a package that logged through
// slog.Default would write past -v and past the stream the process was
// given.
func TestTheLoggerIsNotInstalledAsTheDefault(t *testing.T) {
	t.Parallel()

	before := slog.Default()

	var log bytes.Buffer
	newLogger(&log, 2).Info("handed down")

	assert.Same(t, before, slog.Default())
	assert.Contains(t, log.String(), "handed down")
}
