// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"

	"github.com/GSI-HPC/sdash/internal/exitcode"
	"github.com/GSI-HPC/sdash/internal/server"
	"github.com/GSI-HPC/sdash/internal/static"
	"github.com/GSI-HPC/sdash/internal/version"
)

// devDist is where "npm run build" in web/ writes the interface, relative
// to the root of a checkout, which is where --dev expects sdash to be
// started.
const devDist = "web/dist"

// serve runs the server until ctx is cancelled. It is the serveFunc of the
// program.
func serve(ctx context.Context, p Process, o options) error {
	// Checked before anything is started, so that a mistake on the command
	// line is reported as one.
	if err := server.CheckListen(o.listen); err != nil {
		return exitcode.Wrap(exitcode.Usage, fmt.Errorf("--listen: %w", err))
	}
	logger := newLogger(p.Stderr, o.verbosity)
	files, err := interfaceFiles(o.dev)
	if err != nil {
		return err
	}

	srv, err := server.New(ctx, server.Config{
		Listen: o.listen,
		Dev:    o.dev,
		Files:  files,
		// The browser API that api/openapi.yaml defines
		// (doc/adr/0011-openapi-first-browser-api.md). It is handed over as
		// one handler so that the server mounts it behind its checks and
		// nowhere else.
		API: server.NewAPI(server.APIConfig{
			Build:    version.Get(),
			ReadOnly: o.readOnly,
			Logger:   logger,
		}),
		Logger: logger,
	})
	if err != nil {
		return err
	}
	if o.readOnly {
		// Nothing sdash does yet could change a cluster: everything that
		// speaks to Slurm waits for doc/adr/0016-e2e-and-fixtures-on-sind.md.
		// Until then the flag has nothing to hold back, and all it does is
		// show in the status the API reports.
		logger.Info("read-only mode")
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
	file, err := p.Browser.Open(address)
	if err != nil {
		logger.Warn("cannot open a browser", "error", err)
		return ""
	}
	return file
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
