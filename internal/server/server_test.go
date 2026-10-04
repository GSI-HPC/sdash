// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// running is a Server whose Run is under way in a goroutine.
type running struct {
	*Server
	cancel context.CancelFunc
	result chan error
}

// stop tells the server to stop and returns what Run returned.
func (r *running) stop() error {
	r.cancel()
	err := <-r.result
	// A second call, as the cleanup makes, finds the result again.
	r.result <- err
	return err
}

// start builds a server on a free loopback port and runs it until the test
// ends or stop is called.
func start(t *testing.T, cfg Config) *running {
	t.Helper()
	if cfg.Listen == "" {
		cfg.Listen = "127.0.0.1:0"
	}
	if cfg.Files == nil {
		cfg.Files = builtFiles()
	}
	srv, err := New(t.Context(), cfg)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	r := &running{Server: srv, cancel: cancel, result: make(chan error, 1)}
	go func() { r.result <- srv.Run(ctx) }()
	t.Cleanup(func() { _ = r.stop() })
	return r
}

// browser returns an HTTP client that keeps cookies as a browser does.
func browser(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	client := &http.Client{Jar: jar}
	t.Cleanup(client.CloseIdleConnections)
	return client
}

// get fetches an address and returns the status and the body.
func get(t *testing.T, client *http.Client, address string) (int, string) {
	t.Helper()
	resp, err := client.Get(address)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, string(body)
}

// The whole way in, over a real connection: the printed address signs the
// browser in and lands on the interface, and from then on the API answers.
func TestThePrintedAddressSignsABrowserIn(t *testing.T) {
	t.Parallel()

	stub := &apiStub{}
	srv := start(t, Config{API: stub})
	client := browser(t)
	base, err := url.Parse(srv.URL())
	require.NoError(t, err)
	api := "http://" + base.Host + "/api/v1/status"

	status, _ := get(t, client, api)
	require.Equal(t, http.StatusUnauthorized, status, "the API is closed before the browser has signed in")

	status, body := get(t, client, srv.URL())
	require.Equal(t, http.StatusOK, status)
	assert.Equal(t, indexBody, body)

	status, body = get(t, client, api)
	assert.Equal(t, http.StatusOK, status)
	assert.JSONEq(t, `{"stub":true}`, body)
	assert.Equal(t, []string{"GET /api/v1/status"}, stub.seen())
}

func TestTheAddressNamesTheBoundPortAndTheToken(t *testing.T) {
	t.Parallel()

	srv := start(t, Config{})

	assert.Regexp(t, regexp.MustCompile(`^http://127\.0\.0\.1:[1-9][0-9]*/\?token=[A-Z2-7]{26,}$`), srv.URL())
}

// Each launch has a secret of its own, so the address of one sdash opens no
// other, on this machine or after a restart.
func TestEachServerHasATokenOfItsOwn(t *testing.T) {
	t.Parallel()

	first, second := start(t, Config{}), start(t, Config{})
	tokenOf := func(address string) string {
		u, err := url.Parse(address)
		require.NoError(t, err)
		return u.Query().Get("token")
	}

	assert.NotEqual(t, tokenOf(first.URL()), tokenOf(second.URL()))
}

// When the port that was asked for is taken, the checks have to follow the
// port that was bound: the Host allow-list and the cookie's name are built
// from it.
func TestAServerOnAFallbackPortAnswersToThatPort(t *testing.T) {
	t.Parallel()

	holder, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = holder.Close() })

	srv := start(t, Config{Listen: holder.Addr().String()})
	base, err := url.Parse(srv.URL())
	require.NoError(t, err)

	require.NotEqual(t, holder.Addr().String(), base.Host)
	status, body := get(t, browser(t), srv.URL())
	assert.Equal(t, http.StatusOK, status)
	assert.Equal(t, indexBody, body)
}

// A signal is the normal way to stop this server, so stopping is no error:
// the process exits 0 (internal/exitcode).
func TestRunReturnsNilAfterACleanStop(t *testing.T) {
	t.Parallel()

	srv := start(t, Config{})
	status, _ := get(t, browser(t), srv.URL())
	require.Equal(t, http.StatusOK, status)

	require.NoError(t, srv.stop())
}

// A request that is being answered when the signal arrives belongs to a
// user who is looking at the page; it is finished, not cut.
func TestARequestInFlightIsFinishedBeforeTheServerStops(t *testing.T) {
	t.Parallel()

	arrived, release := make(chan struct{}), make(chan struct{})
	slow := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(arrived)
		<-release
		_, _ = w.Write([]byte("finished"))
	})
	srv := start(t, Config{API: slow})
	client := browser(t)
	status, _ := get(t, client, srv.URL())
	require.Equal(t, http.StatusOK, status)
	base, err := url.Parse(srv.URL())
	require.NoError(t, err)

	var answer struct {
		status int
		body   string
	}
	var fetched sync.WaitGroup
	fetched.Go(func() {
		resp, err := client.Get("http://" + base.Host + "/api/v1/slow")
		if err != nil {
			return
		}
		defer func() { _ = resp.Body.Close() }()
		body, _ := io.ReadAll(resp.Body)
		answer.status, answer.body = resp.StatusCode, string(body)
	})
	await(t, arrived, "the request to reach its handler")

	stopped := make(chan error, 1)
	go func() { stopped <- srv.stop() }()
	// The listener closes first; once it has, the shutdown is waiting for
	// the request and for nothing else.
	require.Eventually(t, func() bool {
		conn, err := net.Dial("tcp", base.Host)
		if err == nil {
			_ = conn.Close()
		}
		return err != nil
	}, 10*time.Second, 5*time.Millisecond)
	close(release)

	require.NoError(t, await(t, stopped, "the server to stop"))
	fetched.Wait()
	assert.Equal(t, http.StatusOK, answer.status)
	assert.Equal(t, "finished", answer.body)
}

// pipeListener hands the server connections that live in memory, which is
// what lets a test run on synctest's clock: a real socket is not something
// the clock can wait for.
type pipeListener struct {
	conns  chan net.Conn
	closed chan struct{}
	once   sync.Once
}

func newPipeListener() *pipeListener {
	return &pipeListener{conns: make(chan net.Conn), closed: make(chan struct{})}
}

func (l *pipeListener) Accept() (net.Conn, error) {
	select {
	case conn := <-l.conns:
		return conn, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *pipeListener) Close() error {
	l.once.Do(func() { close(l.closed) })
	return nil
}

func (l *pipeListener) Addr() net.Addr { return testAddr() }

// dial returns the client's end of a new connection to the server.
func (l *pipeListener) dial() net.Conn {
	client, server := net.Pipe()
	l.conns <- server
	return client
}

// A request that never ends must not keep the process from stopping. After
// the grace period it is cut off, and Run says so, since that stop was not
// a clean one and the exit code should show it.
func TestARequestThatOutlastsTheGracePeriodIsCutOffAndReported(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		arrived := make(chan struct{})
		listener := newPipeListener()
		srv := newServer(listener, http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
			close(arrived)
			<-r.Context().Done()
		}), discardLogger())
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		result := make(chan error, 1)
		go func() { result <- srv.Run(ctx) }()

		client := listener.dial()
		defer func() { _ = client.Close() }()
		_, err := io.WriteString(client, "GET / HTTP/1.1\r\nHost: "+testHost+"\r\n\r\n")
		require.NoError(t, err)
		<-arrived

		begun := time.Now()
		cancel()
		err = <-result

		require.ErrorIs(t, err, context.DeadlineExceeded)
		assert.Equal(t, shutdownGrace, time.Since(begun))
	})
}

// A browser opens connections before it needs them. One that has sent
// nothing has nothing to finish, yet the standard library waits for it as
// for a request until it is five seconds old. Stopping sdash just after a
// page was loaded must neither take the grace period nor end in an error.
func TestAConnectionWithoutARequestDoesNotHoldTheStopUp(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		listener := newPipeListener()
		srv := newServer(listener, http.NotFoundHandler(), discardLogger())
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		result := make(chan error, 1)
		go func() { result <- srv.Run(ctx) }()

		client := listener.dial()
		defer func() { _ = client.Close() }()
		// The server has taken the connection and waits for a request.
		synctest.Wait()

		begun := time.Now()
		cancel()

		require.NoError(t, <-result)
		assert.Less(t, time.Since(begun), time.Second)
		_, err := client.Read(make([]byte, 1))
		assert.ErrorIs(t, err, io.EOF, "the server has closed the connection")
	})
}

// The three cases of a connection at the moment the server stops: one that
// has sent nothing is closed, one that arrives after the stop began is
// closed on arrival, and one with a request under way is left to finish.
func TestOnlyConnectionsWithoutARequestAreClosedAtTheStop(t *testing.T) {
	t.Parallel()

	spare := &spareConns{conns: map[net.Conn]struct{}{}}
	isClosed := func(peer net.Conn) bool {
		// A pipe refuses a deadline once either of its ends is closed,
		// which tells without a read that could block.
		return errors.Is(peer.SetDeadline(time.Now()), io.ErrClosedPipe)
	}
	idle, idlePeer := net.Pipe()
	busy, busyPeer := net.Pipe()
	late, latePeer := net.Pipe()
	t.Cleanup(func() {
		for _, conn := range []net.Conn{idle, idlePeer, busy, busyPeer, late, latePeer} {
			_ = conn.Close()
		}
	})

	spare.track(idle, http.StateNew)
	spare.track(busy, http.StateNew)
	spare.track(busy, http.StateActive)
	spare.closeAll()
	spare.track(late, http.StateNew)

	assert.True(t, isClosed(idlePeer), "a connection that has sent nothing")
	assert.True(t, isClosed(latePeer), "a connection that arrived after the stop began")
	assert.False(t, isClosed(busyPeer), "a connection with a request under way")
}

// A listener that fails under the server is a failure of the server, and
// Run must return rather than wait for a signal that has no reason to come.
func TestRunReturnsWhenServingFails(t *testing.T) {
	t.Parallel()

	srv, err := New(t.Context(), Config{Listen: "127.0.0.1:0", Files: builtFiles()})
	require.NoError(t, err)
	require.NoError(t, srv.listener.Close())

	err = srv.Run(t.Context())

	require.ErrorContains(t, err, "serve")
	require.ErrorIs(t, err, net.ErrClosed)
}

func TestNewRefusesWhatItCannotServe(t *testing.T) {
	t.Parallel()

	t.Run("an address beyond this machine", func(t *testing.T) {
		t.Parallel()

		srv, err := New(t.Context(), Config{Listen: "0.0.0.0:0", Files: builtFiles()})

		require.ErrorContains(t, err, "not a loopback address")
		assert.Nil(t, srv)
	})

	t.Run("no interface to serve", func(t *testing.T) {
		t.Parallel()

		srv, err := New(t.Context(), Config{Listen: "127.0.0.1:0"})

		require.Error(t, err)
		assert.Nil(t, srv)
	})
}

// A panic in a handler is reported by the standard library, which without
// a logger of its own writes to the process-wide one of package log. It has
// to arrive in the logger that was handed in.
func TestAHandlersPanicIsLoggedThroughTheGivenLogger(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}
	srv := start(t, Config{
		API:    http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("handler bug") }),
		Logger: log.logger(),
	})
	client := browser(t)
	status, _ := get(t, client, srv.URL())
	require.Equal(t, http.StatusOK, status)
	base, err := url.Parse(srv.URL())
	require.NoError(t, err)

	resp, err := client.Get("http://" + base.Host + "/api/v1/status")
	if err == nil {
		_ = resp.Body.Close()
	}

	require.Error(t, err, "the connection is dropped")
	require.Eventually(t, func() bool {
		return regexp.MustCompile(`level=ERROR msg="http: panic serving [^"]*: handler bug`).MatchString(log.String())
	}, 10*time.Second, 5*time.Millisecond)
}
