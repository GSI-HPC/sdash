// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/GSI-HPC/go-clikit/cobratree"
	"github.com/GSI-HPC/go-clikit/fsutil"
	"github.com/GSI-HPC/go-clikit/localweb"
	"github.com/GSI-HPC/go-clikit/localweb/launch"

	"github.com/GSI-HPC/sdash/internal/clusters"
	"github.com/GSI-HPC/sdash/internal/profile"
	"github.com/GSI-HPC/sdash/internal/server"
	"github.com/GSI-HPC/sdash/internal/static"
	"github.com/GSI-HPC/sdash/internal/version"
)

// devDist is where "npm run build" in web/ writes the interface, relative
// to the root of a checkout, which is where --dev expects sdash to be
// started.
const devDist = "web/dist"

// The directory of sdash's own in the user's runtime directory, which the
// system creates for the user alone and removes at the last logout. It holds
// the default socket of "--listen unix:" and the lock and the record of the
// server that runs (doc/adr/0028-one-sdash-server-per-user.md).
const (
	runtimeDirVariable = "XDG_RUNTIME_DIR"
	runtimeSubdir      = "sdash"
	socketName         = "sdash.sock"
)

// retireWait is how long a server that stops waits for the lock under which
// it removes its record. The context that stopped the server has ended, and
// with it Retire would give up at once on a lock that is busy for a moment,
// as it is while a second start looks for this server, and leave a record
// that costs the next start a check.
const retireWait = 2 * time.Second

// unknownHost stands in the forwarding hint for the name of a machine that
// does not report one.
const unknownHost = "<this host>"

// What a sdash on a unix socket prints in place of an address: the socket,
// how a port is forwarded to it, and the address behind that forward
// (forwardHint). Both forms end in the same words, by which a reader of the
// output knows that the hint is complete.
const (
	// hintWithCommand takes the path of the socket, the port of the forward
	// with the socket as one word of a shell command, the name of this host,
	// the address, and the port again.
	hintWithCommand = `sdash is serving on the unix socket %s

A browser cannot open a unix socket. Run this on your own machine, the one
your browser is on, to forward a port of it to the socket:

    ssh -L %s %s

Then open this address there, for as long as the command runs:

    %s

The port %s is a suggestion. Any free port of your machine does, in the
command and in the address alike.
`
	// hintWithoutCommand takes the path of the socket, what keeps the path
	// out of a command (unforwardable), the address, and the port.
	hintWithoutCommand = `sdash is serving on the unix socket %s

A browser cannot open a unix socket. A port of your own machine, the one
your browser is on, has to be forwarded to the socket, and sdash prints no
command for that here: the path of this socket cannot be given to ssh -L
as it is.
%s

Start sdash on a socket whose path ssh -L takes as it is, with
--listen unix:PATH, and it prints the command. With a forward of your
own to this socket, open this address on your machine, for as long as the
forward runs:

    %s

The port %s is a suggestion. Any free port of your machine does, in the
forward and in the address alike.
`
)

// forwardHint returns what a sdash on the unix socket at path prints in
// place of an address. host names this machine, and address is what to open
// behind a forward that starts from server.DefaultPort.
//
// A path that ssh -L cannot be given as it is gets no command, and the
// reason in its place (unforwardable). The command is there to be copied,
// and one that forwards to another path, or is refused, is worse than none.
func forwardHint(path, host, address string) string {
	if reason := unforwardable(path); reason != "" {
		return fmt.Sprintf(hintWithoutCommand, path, reason, address, server.DefaultPort)
	}
	return fmt.Sprintf(hintWithCommand, path,
		shellWord(server.DefaultPort+":"+path), host, address, server.DefaultPort)
}

// unforwardable says what in the path of a socket keeps it out of the
// argument of ssh -L, one sentence to a line, or "" when nothing does.
//
// ssh reads that argument, here port:path, as parts with colons between
// them, takes a backslash for the escape of the character after it, which
// it then removes, and expands a percent sign as a token and ${NAME} as an
// environment variable. A path that holds any of them arrives as another
// path or as no forward at all. sdash does not escape them: how an ssh reads an
// escape is its own matter, below the quoting of the shell the command is
// pasted into, and a command that is printed to be copied has to be right
// as it stands.
func unforwardable(path string) string {
	var reasons []string
	if strings.Contains(path, ":") {
		reasons = append(reasons, "It holds a colon, which ssh -L takes for the end of a part of its argument.")
	}
	if strings.Contains(path, `\`) {
		reasons = append(reasons, "It holds a backslash, which ssh -L takes for an escape and removes.")
	}
	if strings.Contains(path, "%") {
		reasons = append(reasons, "It holds a percent sign, which ssh -L takes for the start of a token it expands.")
	}
	if strings.Contains(path, "${") {
		reasons = append(reasons, "It holds ${, which ssh -L takes for an environment variable it expands.")
	}
	return strings.Join(reasons, "\n")
}

// serve runs the server until ctx is cancelled. It is the serveFunc of the
// program.
func serve(ctx context.Context, p Process, o options) error {
	// Checked before anything is started, so that a mistake on the command
	// line is reported as one.
	listen, err := listenAddress(o.listen, p.getenv)
	if err == nil {
		err = localweb.CheckAddr(listen)
	}
	if err != nil {
		return cobratree.Usagef("--listen: %w", err)
	}
	logger := newLogger(p.Stderr, o.verbosity)
	instance := acquireInstance(ctx, p, logger, o)
	if ctx.Err() != nil {
		// Interrupted while waiting for the lock of another start, which
		// is a stop like any other and not a reason to serve.
		if instance != nil {
			instance.Release()
		}
		return nil
	}
	if instance != nil {
		// Held from here to the record below: a second start waits for it,
		// so that two cannot both find no server and both start one.
		defer instance.Release()
		if running, ok := instance.Running(); ok {
			logger.Info("an sdash of this user runs already", "pid", running.PID)
			return attach(p, logger, o, running.URL)
		}
	}
	files, err := interfaceFiles(o.dev)
	if err != nil {
		return err
	}
	set, err := loadClusters(ctx, p, logger, o.config)
	if err != nil {
		return err
	}

	srv, err := server.New(ctx, server.Config{
		Listen: listen,
		Dev:    o.dev,
		// The one flag is told to the server twice: here it makes the
		// server refuse what could change something, and below it makes the
		// API report the mode to the interface.
		ReadOnly: o.readOnly,
		Files:    files,
		UID:      p.Getuid,
		// The browser API that api/openapi.yaml defines
		// (doc/adr/0011-openapi-first-browser-api.md). It is handed over as
		// one handler so that the server mounts it behind its checks and
		// nowhere else.
		API: server.NewAPI(server.APIConfig{
			Build:    version.Get(),
			ReadOnly: o.readOnly,
			Clusters: set,
			Logger:   logger,
		}),
		Logger: logger,
	})
	if err != nil {
		return err
	}
	if o.readOnly {
		logger.Info("read-only mode, refusing every request that could change something")
	}

	if socket := srv.Socket(); socket != "" {
		// No browser is opened: one on this host could not open the socket
		// either, and the user's own is on another machine. A terminal that
		// cannot be written to does not stop the server, as below.
		_, _ = io.WriteString(p.Stdout, forwardHint(socket, p.hostname(), srv.URL()))
		return srv.Run(ctx)
	}

	// Recorded before the address is printed, so that a start that follows
	// a script's reading of the address finds the server.
	if instance != nil {
		if err := instance.Publish(srv.URL()); err != nil {
			// Publish drops the lock when it succeeds. The server still
			// serves, but a start would wait for the lock until it ends.
			instance.Release()
			logger.Warn("cannot record the server for a second start", "error", err)
		} else {
			defer func() {
				retire, cancel := context.WithTimeout(context.WithoutCancel(ctx), retireWait)
				defer cancel()
				if err := instance.Retire(retire); err != nil {
					logger.Warn("cannot remove the record of the server", "error", err)
				}
			}()
		}
	}

	// Always printed, whether or not a browser opens: it is the only way in
	// for a user whose browser is somewhere else. A terminal that cannot
	// be written to does not stop a server whose browser may still open.
	_, _ = fmt.Fprintf(p.Stdout, "sdash is serving at %s\n", srv.URL())

	if file := openBrowser(p, logger, o, srv.URL()); file != "" {
		// The file holds the token. One that cannot be removed is replaced
		// by the next run on the same port, and its token ends with this
		// process.
		defer func() { _ = os.Remove(file) }()
	}
	return srv.Run(ctx)
}

// loadClusters reads the profile file, the one named by --config or else
// the default one, and builds its clusters, whose fetches end with ctx. A
// default file that does not exist is no clusters; a file that is wrong in
// any way is a configuration error, reported before anything is started.
func loadClusters(ctx context.Context, p Process, logger *slog.Logger, config string) (*clusters.Set, error) {
	path, optional := config, false
	if path == "" {
		var err error
		if path, err = profile.DefaultPath(p.getenv); err != nil {
			logger.Info("reading no profile file", "reason", err)
			return clusters.New(ctx, profile.Profile{}, clusters.Options{})
		}
		optional = true
	}
	prof, err := profile.Load(path, optional, p.getenv)
	if err != nil {
		return nil, cobratree.Usage(err)
	}
	if prof.Path == "" {
		logger.Info("no profile file names a cluster", "path", path)
	}
	set, err := clusters.New(ctx, prof, clusters.Options{Getenv: p.getenv, Logger: logger})
	if err != nil {
		return nil, cobratree.Usage(fmt.Errorf("profile file %s: %w", path, err))
	}
	for _, c := range set.All() {
		logger.Info("serve a cluster", "cluster", c.Name, "endpoint", c.Endpoint)
	}
	return set, nil
}

// acquireInstance returns the guard that keeps one sdash server per user,
// with its lock taken, or nil when this start is not under it: the command
// line asks for a server of its own, the runtime directory is not usable or
// the system cannot lock. None of these stops the server. A start that is
// not under the guard behaves as it did before there was one.
func acquireInstance(ctx context.Context, p Process, logger *slog.Logger, o options) *launch.Instance {
	if o.ownServer {
		return nil
	}
	runtimeDir := p.getenv(runtimeDirVariable)
	if !filepath.IsAbs(runtimeDir) {
		// Unset, or a relative path, which the XDG Base Directory
		// specification has ignored. macOS sets none.
		logger.Info("not looking for a running sdash", "reason", runtimeDirVariable+" is not set to an absolute path")
		return nil
	}
	instance, err := launch.Acquire(ctx, runtimeDir, runtimeSubdir)
	switch {
	case errors.Is(err, errors.ErrUnsupported):
		logger.Info("not looking for a running sdash", "reason", err)
		return nil
	case err != nil && ctx.Err() != nil:
		return nil
	case err != nil:
		logger.Warn("cannot look for a running sdash", "error", err)
		return nil
	}
	return instance
}

// attach is what a second start does: it prints the address of the sdash
// that runs, as that one printed it, and opens the browser on it. The
// redirect file it writes is the one of the running server, which is the
// same port, and which that server removes when it stops.
func attach(p Process, logger *slog.Logger, o options, address string) error {
	_, _ = fmt.Fprintf(p.Stdout, "sdash is serving at %s\n", address)
	_ = openBrowser(p, logger, o, address)
	return nil
}

// listenAddress turns the value of --listen into the address the server is
// handed. A host and a port pass as they are. A unix socket is given its
// path in full: the default one in the runtime directory when none is
// named, and an absolute one for one that is relative to the working
// directory, since the path is also printed for a command that runs
// somewhere else. Without a runtime directory there is no default socket,
// and one that is named by a relative path counts as none.
func listenAddress(listen string, getenv func(string) string) (string, error) {
	path, isSocket := strings.CutPrefix(listen, localweb.UnixPrefix)
	if !isSocket {
		return listen, nil
	}
	if path == "" {
		runtimeDir := getenv(runtimeDirVariable)
		if runtimeDir == "" {
			return "", fmt.Errorf("%q names no socket, and %s, where the default one would lie, is not set; name one, as in %s/path/to/sdash.sock",
				listen, runtimeDirVariable, localweb.UnixPrefix)
		}
		if !filepath.IsAbs(runtimeDir) {
			// The XDG Base Directory specification has a relative path in
			// one of its variables ignored. Made absolute like a path the
			// user names, it would put the default socket below whatever
			// directory sdash was started in.
			return "", fmt.Errorf("%q names no socket, and %s, where the default one would lie, is %q: a relative path, which is "+
				"not valid there and counts as not set; name one, as in %s/path/to/sdash.sock",
				listen, runtimeDirVariable, runtimeDir, localweb.UnixPrefix)
		}
		path = filepath.Join(runtimeDir, runtimeSubdir, socketName)
	}
	if strings.HasPrefix(path, "~") {
		// A shell expands ~ at the start of a word only, and here it
		// follows the scheme. Taken as it is, it would become a directory
		// named ~ in the working directory, which is a trap for whoever
		// removes it later.
		return "", fmt.Errorf("the shell has left the ~ in %q as it is; write the directory out, as in %s$HOME/sdash.sock",
			listen, localweb.UnixPrefix)
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("make the socket path absolute: %w", err)
	}
	return localweb.UnixPrefix + path, nil
}

// getenv reads a variable of the environment of p.
func (p Process) getenv(name string) string {
	if p.Getenv == nil {
		return ""
	}
	return p.Getenv(name)
}

// hostname returns the name of the machine p runs on, for the user to name
// it by from another one, or unknownHost.
func (p Process) hostname() string {
	if p.Hostname == nil {
		return unknownHost
	}
	// A machine that cannot say its name is no reason not to serve; the
	// user knows what to put in its place.
	name, err := p.Hostname()
	if err != nil || name == "" {
		return unknownHost
	}
	return name
}

// shellWord returns s as one word of a shell command line: as it is when
// it holds nothing a shell reads a meaning into, and in single quotes
// otherwise. The forwarding hint is there to be copied, and a socket path
// with a space in it would otherwise be two arguments.
func shellWord(s string) string {
	plain := func(r rune) bool {
		return r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' ||
			strings.ContainsRune("_-./:@%+=,", r)
	}
	if s != "" && strings.IndexFunc(s, func(r rune) bool { return !plain(r) }) < 0 {
		return s
	}
	// Inside single quotes nothing has a meaning but the quote itself,
	// which is closed, written escaped and opened again.
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// openBrowser opens address on the user's desktop unless the flags or the
// environment say not to, and returns the file it wrote for that, or "".
// Not being able to open a browser is no failure of the server: the address
// is printed, so it is logged and nothing more.
func openBrowser(p Process, logger *slog.Logger, o options, address string) string {
	if o.noBrowser {
		return ""
	}
	if reason := p.Browser.Skip(); reason != "" {
		logger.Info("not opening a browser", "reason", reason)
		return ""
	}
	opener := p.Browser
	dir, err := redirectDir(p)
	if err == nil {
		opener.Dir = dir
		var file string
		if file, err = opener.Open(address); err == nil {
			return file
		}
	}
	logger.Warn("cannot open a browser", "error", err)
	return ""
}

// redirectDir returns the directory the redirect file is written to, below
// the user's cache directory and closed to the other users. EnsureDir
// refuses a directory that another user owns or can write, and the opener
// refuses one that is not 0700; none is repaired, as the mode may be the
// user's choice. The file holds the launch token, and its name carries the
// port: a later run on the same port replaces the file of an earlier one
// that could not remove its own.
func redirectDir(p Process) (string, error) {
	if p.CacheDir == nil {
		return "", errors.New("no cache directory is known")
	}
	cache, err := p.CacheDir()
	if err != nil {
		return "", fmt.Errorf("find the cache directory: %w", err)
	}
	dir := filepath.Join(cache, "sdash")
	if err := fsutil.EnsureDir(dir); err != nil {
		return "", fmt.Errorf("prepare the directory of the redirect file: %w", err)
	}
	return dir, nil
}

// interfaceFiles returns the file system the user interface is served from:
// the build embedded in the binary, or with dev the one on disk, which a
// rebuild changes under the running server.
func interfaceFiles(dev bool) (fs.FS, error) {
	if dev {
		return os.DirFS(devDist), nil
	}
	return static.Files()
}

// newLogger builds the logger of the process for a count of -v flags. It
// writes to w and is handed to whatever logs; nothing sets it as the default
// of package slog.
//
// Without -v only warnings and errors appear, so that a terminal shows the
// address and what needs attention. -v adds what sdash does, -vv every
// request.
func newLogger(w io.Writer, verbosity int) *slog.Logger {
	level := slog.LevelWarn
	switch {
	case verbosity >= 2:
		level = slog.LevelDebug
	case verbosity == 1:
		level = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: level}))
}
