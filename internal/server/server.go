// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"
)

// The limits of the HTTP server. Its only intended client is a browser on
// the same machine, but every local process can connect, so none of them is
// left unbounded.
const (
	// readHeaderTimeout ends a connection that is opened and then sends
	// its request line and headers too slowly, or not at all.
	readHeaderTimeout = 10 * time.Second
	// readTimeout bounds the whole request. The bodies of the browser API
	// are small JSON documents.
	readTimeout = 30 * time.Second
	// writeTimeout bounds the time from the end of the request headers to
	// the end of the response. A handler that has reason to take longer
	// moves its own deadline with http.ResponseController.
	writeTimeout = time.Minute
	// idleTimeout closes the kept-alive connections of a tab that has
	// stopped asking.
	idleTimeout = 2 * time.Minute
	// maxHeaderBytes is far above what a browser sends to this origin, one
	// cookie included, and far below the default of 1 MiB.
	maxHeaderBytes = 64 << 10
	// shutdownGrace is how long the requests in flight get to finish once
	// the server is told to stop.
	shutdownGrace = 5 * time.Second
)

// Config is what a Server is built from.
type Config struct {
	// Listen says where to listen (CheckListen): a loopback host and a
	// port, or UnixScheme and the path of a unix socket.
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
	// Logger receives the server's log. Nothing is logged without one.
	Logger *slog.Logger
}

// Server is what sdash listens on, bound, with the handler tree that serves
// it. New binds it, URL and Socket say where it is, and Run serves until it
// is told to stop.
type Server struct {
	http *http.Server
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
	return newOn(ctx, cfg, systemBind)
}

// newOn is New with the function that binds, which a test replaces.
func newOn(ctx context.Context, cfg Config, bind bindFunc) (*Server, error) {
	if err := CheckListen(cfg.Listen); err != nil {
		return nil, err
	}
	if cfg.Files == nil {
		return nil, errors.New("no file system to serve the user interface from")
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}

	opened, err := open(ctx, bind, cfg.Listen, logger)
	if err != nil {
		return nil, err
	}
	token := newToken()
	for _, listener := range opened.listeners {
		logger.Info("listening", "address", listener.Addr().String(), "dev", cfg.Dev)
	}

	srv := newServer(opened.listeners, newRouter(routerConfig{
		addrs:    opened.addrs,
		socket:   opened.socket != "",
		token:    token,
		dev:      cfg.Dev,
		readOnly: cfg.ReadOnly,
		files:    cfg.Files,
		api:      cfg.API,
		logger:   logger,
	}), logger)
	srv.socket = opened.socket
	srv.url = "http://" + opened.host() + "/?" + tokenParameter + "=" + token
	return srv, nil
}

// newServer puts handler behind listeners with the limits and the shutdown
// behaviour of this package.
func newServer(listeners []net.Listener, handler http.Handler, logger *slog.Logger) *Server {
	spare := &spareConns{conns: map[net.Conn]struct{}{}}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
		ConnState:         spare.track,
		// The standard library reports a handler's panic and a broken
		// connection through this logger; without it they would go to the
		// process-wide one of package log.
		ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	// Shutdown calls this once the listener is closed. A connection the
	// listener handed out just before that is closed by track.
	server.RegisterOnShutdown(spare.closeAll)
	return &Server{http: server, listeners: listeners, logger: logger}
}

// spareConns are the connections on which no request has arrived in full
// yet: http.StateNew, which lasts until the request headers are read. A
// browser opens such connections ahead of need.
//
// They are tracked because http.Server.Shutdown waits for one of them as it
// does for a request in flight, until the connection is five seconds old,
// which is as long as shutdownGrace. Without this, stopping sdash shortly
// after a page was loaded would take the whole grace period and then report
// that requests were cut off, although none was under way. A connection
// without a request has nothing to finish, so it is closed at once.
type spareConns struct {
	mu    sync.Mutex
	conns map[net.Conn]struct{}
	// closing is set once the server stops; a connection that the listener
	// handed out just before it closed is then closed on arrival.
	closing bool
}

// track follows the state of a connection; it is the server's ConnState
// hook.
func (s *spareConns) track(conn net.Conn, state http.ConnState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch {
	case state != http.StateNew:
		delete(s.conns, conn)
	case s.closing:
		// The server notices the closed connection when it reads from it;
		// there is nothing else to tell it.
		_ = conn.Close()
	default:
		s.conns[conn] = struct{}{}
	}
}

// closeAll closes the connections that have sent nothing, and every one
// that turns up later.
func (s *spareConns) closeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closing = true
	for conn := range s.conns {
		// As in track: the server notices when it reads.
		_ = conn.Close()
	}
	clear(s.conns)
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
// file system, and the requests in flight get shutdownGrace to finish. It
// returns nil after such a clean stop. It returns an error when serving
// fails on its own, or when requests had to be cut off at the end of the
// grace period.
func (s *Server) Run(ctx context.Context) error {
	served := make(chan error, len(s.listeners))
	for _, listener := range s.listeners {
		go func() { served <- s.http.Serve(listener) }()
	}

	select {
	case err := <-served:
		// One listener has failed. Another one would go on answering
		// under half of the names the user was told, so it stops too, at
		// once: a server that is failing owes its requests no grace. The
		// error to report is the one that was the cause.
		_ = s.http.Close()
		for range len(s.listeners) - 1 {
			<-served
		}
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}

	s.logger.Info("shutting down")
	// ctx is cancelled already; the grace period needs a context that is
	// not.
	grace, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownGrace)
	defer cancel()
	err := s.http.Shutdown(grace)
	if err != nil {
		// Shutdown has given up waiting; what is still open is closed
		// now, and the error to report is Shutdown's.
		_ = s.http.Close()
		err = fmt.Errorf("stop within %s: %w", shutdownGrace, err)
	}
	// Serve returns as soon as its listener closes, with
	// http.ErrServerClosed and nothing to add.
	for range s.listeners {
		<-served
	}
	return err
}
