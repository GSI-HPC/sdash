// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"net/http"

	"github.com/GSI-HPC/go-clikit/localweb"
)

// Config is what a Server is built from.
type Config struct {
	// Listen says where to listen (localweb.CheckAddr): a loopback host and
	// a port, or localweb.UnixPrefix and the path of a unix socket.
	//
	// The name localhost binds the port on 127.0.0.1 and on ::1, or on
	// 127.0.0.1 alone on a host without an IPv6 loopback address; a literal
	// address binds that address only. When another process holds the port,
	// a free one is bound instead and the log says which.
	//
	// A unix socket is for a host that is shared with other users. It binds
	// no port, and a browser reaches it through a forward (Server.Socket).
	// The socket has to lie where nobody but the user can replace it, or New
	// refuses it: in a directory of the user's, below directories that only
	// the user or the system may write to.
	Listen string
	// Dev accepts the requests the Vite dev server proxies to this one in
	// the development loop: its origins pass the same-origin check. It
	// weakens that check and is for a developer's machine only.
	Dev bool
	// ReadOnly refuses every request to the browser API that could change
	// something, whatever the handler in API would do with it (readsOnly).
	// The status the API reports is told of the mode through
	// APIConfig.ReadOnly; the command line sets both from its one flag.
	ReadOnly bool
	// Files holds the built user interface, with index.html at its root:
	// the build embedded in the binary (internal/static), or with --dev the
	// one on disk.
	Files fs.FS
	// API is the handler of the browser API, which NewAPI builds on the
	// routing generated from api/openapi.yaml
	// (doc/adr/0011-openapi-first-browser-api.md). It is mounted under
	// APIPrefix behind the same-origin and session checks and receives each
	// request with its full path, the prefix included. With nil, nothing is
	// mounted and every address under /api/ answers 404 behind the same
	// checks.
	API http.Handler
	// UID returns the ID of the user sdash runs as, as os.Getuid does. With
	// it, a listener on TCP closes the connections that a process of another
	// user opened, before a request is read, on a system that can tell whose
	// a connection is (guardPeers). Without it, nobody is kept out this way.
	UID func() int
	// Logger receives the server's log. Nothing is logged without one.
	Logger *slog.Logger
}

// Server is what sdash listens on, bound, with the handler tree that serves
// it. New binds it, URL and Socket say where it is, and Run serves until it
// is told to stop.
type Server struct {
	handler http.Handler
	// listeners are served by the one handler: the two loopback addresses
	// of the name localhost, or a single address or socket.
	listeners []net.Listener
	url       string
	socket    string
	logger    *slog.Logger
}

// New binds what cfg.Listen names and prepares the server, without serving
// yet. Everything is bound when New returns, so the address URL returns can
// be printed and opened before Run is called: a browser that is faster than
// Run waits in the listener's queue.
//
// ctx bounds the binding only.
func New(ctx context.Context, cfg Config) (*Server, error) {
	return newOn(ctx, cfg, nil)
}

// newOn is New with the function that binds, which a test replaces; nil
// binds on this machine.
func newOn(ctx context.Context, cfg Config, bind bindFunc) (*Server, error) {
	if err := localweb.CheckAddr(cfg.Listen); err != nil {
		return nil, err
	}
	if cfg.Files == nil {
		return nil, errors.New("no file system to serve the user interface from")
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}

	opened, err := listen(ctx, bind, cfg.Listen, logger)
	if err != nil {
		return nil, err
	}
	listeners, err := guardPeers(opened, cfg.UID, localweb.PeerListener, logger)
	if err != nil {
		return nil, err
	}
	token := newToken()
	for _, listener := range listeners {
		logger.Info("listening", "address", listener.Addr().String(), "dev", cfg.Dev)
	}

	srv := newServer(listeners, newRouter(routerConfig{
		answers:  opened.Answers,
		token:    token,
		dev:      cfg.Dev,
		readOnly: cfg.ReadOnly,
		files:    cfg.Files,
		api:      cfg.API,
		logger:   logger,
	}), logger)
	srv.socket = opened.Socket
	srv.url = "http://" + forwardHost(opened) + "/?" + tokenParameter + "=" + token
	return srv, nil
}

// newServer puts handler behind listeners.
func newServer(listeners []net.Listener, handler http.Handler, logger *slog.Logger) *Server {
	return &Server{handler: handler, listeners: listeners, logger: logger}
}

// URL returns the address that signs a browser in: the root of the server
// with the token of this launch. Whoever holds it acts as the user, so it is
// shown to the user and handed to the user's browser and to nothing else.
//
// A server that holds both loopback addresses is named by 127.0.0.1, the
// name that leads to it whatever a resolver makes of localhost. A server on
// a unix socket has no address a browser can open. Its URL is the one to
// open on the machine a forward to the socket starts from, when that
// forward starts from DefaultPort; for another port the address changes
// with it.
func (s *Server) URL() string {
	return s.url
}

// Socket returns the path of the unix socket the server listens on, and ""
// for a server on TCP. A browser cannot open a socket, so whoever starts
// such a server tells the user how to put a forward in front of it.
//
// The path is the one of Config.Listen with every symbolic link on the way
// to the socket's directory resolved. A forward that is given this path
// follows no link, which somebody could point elsewhere later.
func (s *Server) Socket() string {
	return s.socket
}

// Run serves until ctx is cancelled, then stops: the listeners and the
// connections without a request close at once, a unix socket leaves the
// file system, and the requests in flight get localweb.DefaultGrace to
// finish. It returns nil after such a clean stop. It returns an error when
// serving fails on its own, or when requests had to be cut off at the end of
// the grace period.
//
// localweb.Serve sets the limits of the HTTP server and does the stopping
// (doc/adr/0026-go-clikit-localweb-for-the-listener-and-the-guard.md).
func (s *Server) Run(ctx context.Context) error {
	// A stop by a failed listener is no reason to say that sdash is shutting
	// down: the context does not end then.
	stop := context.AfterFunc(ctx, func() { s.logger.Info("shutting down") })
	defer stop()
	return localweb.Serve(ctx, s.listeners, s.handler, localweb.ServeOptions{
		// The standard library reports a handler's panic and a broken
		// connection through this logger; without it they would go to the
		// process-wide one of package log.
		ErrorLog: slog.NewLogLogger(s.logger.Handler(), slog.LevelError),
	})
}
