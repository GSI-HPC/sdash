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
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
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
	return startOn(t, cfg, systemBind)
}

// startOn is start on a machine of the test's making: bind stands in for
// the system when an address is bound.
func startOn(t *testing.T, cfg Config, bind bindFunc) *running {
	t.Helper()
	if cfg.Listen == "" {
		cfg.Listen = "127.0.0.1:0"
	}
	if cfg.Files == nil {
		cfg.Files = builtFiles()
	}
	srv, err := newOn(t.Context(), cfg, bind)
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

// fetch asks the server at dial for target under the name host, with
// cookies given as name and value in turn, and returns the status and the
// body. The name and the address are apart because that is what the Host
// check is about: a name may lead to an address that is not the name's.
func fetch(t *testing.T, dial, host, target string, cookies ...*http.Cookie) (int, string) {
	t.Helper()
	r, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+dial+target, nil)
	require.NoError(t, err)
	r.Host = host
	for _, cookie := range cookies {
		r.AddCookie(cookie)
	}
	client := &http.Client{
		// The redirect of the token exchange is what the caller looks at.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	t.Cleanup(client.CloseIdleConnections)
	resp, err := client.Do(r)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, string(body)
}

// The default: sdash holds its port on 127.0.0.1 and on ::1, one handler
// answers on both, and with both held it answers to the name localhost,
// which a browser may take to either. The test binds real addresses, so the
// machine it runs on needs an IPv6 loopback address.
func TestLocalhostIsServedOnBothLoopbackAddressesUnderEveryNameOfTheirs(t *testing.T) {
	t.Parallel()

	stub := &apiStub{}
	srv := start(t, Config{Listen: "localhost:0", API: stub})
	require.Len(t, srv.listeners, 2, "this test needs an IPv6 loopback address on the machine")
	printed, err := url.Parse(srv.URL())
	require.NoError(t, err)
	port := printed.Port()
	token := printed.Query().Get("token")
	session := &http.Cookie{Name: "sdash_session_" + port, Value: token}

	// The address the user is given keeps the literal form, which leads to
	// sdash whatever a resolver makes of the name.
	assert.Equal(t, "127.0.0.1", printed.Hostname())
	assert.Equal(t, "127.0.0.1:"+port, srv.listeners[0].Addr().String())
	assert.Equal(t, "[::1]:"+port, srv.listeners[1].Addr().String(), "one port number on both addresses")

	for _, address := range []string{"127.0.0.1:" + port, "[::1]:" + port} {
		for _, name := range []string{address, "localhost:" + port} {
			status, body := fetch(t, address, name, "/")
			assert.Equal(t, http.StatusOK, status, "%s as %s", address, name)
			assert.Equal(t, indexBody, body)

			status, _ = fetch(t, address, name, "/?token="+token)
			assert.Equal(t, http.StatusSeeOther, status, "%s as %s signs in", address, name)

			status, body = fetch(t, address, name, "/api/v1/status", session)
			assert.Equal(t, http.StatusOK, status, "%s as %s reaches the API", address, name)
			assert.JSONEq(t, `{"stub":true}`, body)
		}
		status, _ := fetch(t, address, "rebind.example:"+port, "/")
		assert.Equal(t, http.StatusForbidden, status, "a foreign name on %s", address)
	}
	require.NoError(t, srv.stop())
}

// A port that another process holds on one of the two addresses is no port
// for localhost: sdash would answer to the name while half of it leads
// elsewhere. It takes a port it can have on both and says which. The other
// process is a real one here, on a real address.
func TestAPortHeldOnOneLoopbackAddressIsLeftForOneFreeOnBoth(t *testing.T) {
	t.Parallel()

	for name, held := range map[string]string{"held on 127.0.0.1": "127.0.0.1:0", "held on ::1": "[::1]:0"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			holder, err := net.Listen("tcp", held)
			require.NoError(t, err, "this test needs an IPv6 loopback address on the machine")
			t.Cleanup(func() { _ = holder.Close() })
			_, busy, err := net.SplitHostPort(holder.Addr().String())
			require.NoError(t, err)
			log := &logBuffer{}

			srv := start(t, Config{Listen: "localhost:" + busy, Logger: log.logger()})

			require.Len(t, srv.listeners, 2)
			printed, err := url.Parse(srv.URL())
			require.NoError(t, err)
			port := printed.Port()
			assert.NotEqual(t, busy, port)
			assert.Equal(t, "127.0.0.1:"+port, srv.listeners[0].Addr().String())
			assert.Equal(t, "[::1]:"+port, srv.listeners[1].Addr().String())
			for _, address := range []string{"127.0.0.1:" + port, "[::1]:" + port} {
				status, _ := fetch(t, address, "localhost:"+port, "/")
				assert.Equal(t, http.StatusOK, status, address)
			}
			assert.Contains(t, log.String(), "level=WARN")
			assert.Contains(t, log.String(), "wanted=localhost:"+busy+" address=127.0.0.1:"+port)
		})
	}
}

// On a host without an IPv6 loopback address sdash holds 127.0.0.1 alone,
// and then it is not the one to say where the name localhost leads: the
// name is refused, as it is for a literal address. The machine is the
// test's own making, so that the test does not depend on the one it runs on.
func TestAServerWithoutIPv6LoopbackServesIPv4AndRefusesTheNameLocalhost(t *testing.T) {
	t.Parallel()

	// The addresses are bound one after the other by the call that builds
	// the server, so they are collected as they come and looked at when it
	// has returned: a channel here would have a test that binds more or
	// fewer of them than expected wait for ever.
	var binds []string
	withoutIPv6 := func(ctx context.Context, network, address string) (net.Listener, error) {
		binds = append(binds, address)
		if strings.HasPrefix(address, "[::1]:") {
			return nil, &net.OpError{Op: "listen", Net: network, Err: os.NewSyscallError("bind", syscall.EADDRNOTAVAIL)}
		}
		return systemBind(ctx, network, address)
	}
	log := &logBuffer{}

	srv := startOn(t, Config{Listen: "localhost:0", Logger: log.logger()}, withoutIPv6)

	require.Len(t, srv.listeners, 1)
	printed, err := url.Parse(srv.URL())
	require.NoError(t, err)
	address := printed.Host
	assert.Equal(t, "127.0.0.1", printed.Hostname())
	assert.Equal(t, []string{"127.0.0.1:0", "[::1]:" + printed.Port()}, binds,
		"the IPv6 address was tried, on the same port, and nothing after it")

	status, body := get(t, browser(t), srv.URL())
	assert.Equal(t, http.StatusOK, status)
	assert.Equal(t, indexBody, body)
	status, _ = fetch(t, address, "localhost:"+printed.Port(), "/")
	assert.Equal(t, http.StatusForbidden, status)
	status, _ = fetch(t, address, "[::1]:"+printed.Port(), "/")
	assert.Equal(t, http.StatusForbidden, status)

	assert.Equal(t, 1, strings.Count(log.String(), "no IPv6 loopback address to bind"), log.String())
}

// A literal address is served under its own name and no other, as before
// there was a second listener: the name localhost may lead a browser to the
// address this server does not hold.
func TestALiteralAddressIsNotServedUnderTheNameLocalhost(t *testing.T) {
	t.Parallel()

	srv := start(t, Config{Listen: "127.0.0.1:0"})
	require.Len(t, srv.listeners, 1)
	printed, err := url.Parse(srv.URL())
	require.NoError(t, err)

	status, _ := fetch(t, printed.Host, printed.Host, "/")
	assert.Equal(t, http.StatusOK, status)
	status, _ = fetch(t, printed.Host, "localhost:"+printed.Port(), "/")
	assert.Equal(t, http.StatusForbidden, status)
}

// The flag of the command line reaches the router through Config: a server
// that was asked to be read-only refuses a change over a real connection,
// and one that was not lets it through to the API.
func TestAReadOnlyServerRefusesAChangeAndAnswersARead(t *testing.T) {
	t.Parallel()

	for _, readOnly := range []bool{true, false} {
		t.Run("read-only "+strconv.FormatBool(readOnly), func(t *testing.T) {
			t.Parallel()

			stub := &apiStub{}
			srv := start(t, Config{API: stub, ReadOnly: readOnly})
			client := browser(t)
			status, _ := get(t, client, srv.URL())
			require.Equal(t, http.StatusOK, status)
			printed, err := url.Parse(srv.URL())
			require.NoError(t, err)
			jobs := "http://" + printed.Host + "/api/v1/jobs"

			status, _ = get(t, client, jobs)
			assert.Equal(t, http.StatusOK, status)

			resp, err := client.Post(jobs, "application/json", strings.NewReader("{}"))
			require.NoError(t, err)
			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			require.NoError(t, resp.Body.Close())

			if readOnly {
				assert.Equal(t, http.StatusForbidden, resp.StatusCode)
				assert.Contains(t, string(body), `"code":"read_only"`)
				assert.Equal(t, []string{"GET /api/v1/jobs"}, stub.seen())
			} else {
				assert.Equal(t, http.StatusOK, resp.StatusCode)
				assert.Equal(t, []string{"GET /api/v1/jobs", "POST /api/v1/jobs"}, stub.seen())
			}
		})
	}
}

// One of two listeners that fails takes the other with it: a server that
// answers on half of what it told the user is not what was started.
func TestOneListenerThatFailsStopsTheOther(t *testing.T) {
	t.Parallel()

	loopback, err := net.ListenTCP("tcp", &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1)})
	require.NoError(t, err)
	failing := newPipeListener()
	srv := newServer([]net.Listener{loopback, failing}, http.NotFoundHandler(), discardLogger())
	result := make(chan error, 1)
	go func() { result <- srv.Run(t.Context()) }()

	require.NoError(t, failing.Close())

	err = await(t, result, "the server to stop")
	require.ErrorContains(t, err, "serve")
	require.ErrorIs(t, err, net.ErrClosed)
	// The listener is asked and not its port: a port that was just given up
	// may belong to a test that runs beside this one by now. The deadline
	// has passed, so a listener that is still open says so and does not
	// wait for a connection; a closed one has no deadline to set, which is
	// not what is asked here.
	_ = loopback.SetDeadline(time.Now())
	_, err = loopback.Accept()
	assert.ErrorIs(t, err, net.ErrClosed, "the other listener is closed")
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
		srv := newServer([]net.Listener{listener}, http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
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
		srv := newServer([]net.Listener{listener}, http.NotFoundHandler(), discardLogger())
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
	require.NoError(t, srv.listeners[0].Close())

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
