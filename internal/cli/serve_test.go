// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/browser"
	"github.com/GSI-HPC/sdash/internal/exitcode"
	"github.com/GSI-HPC/sdash/internal/server"
)

// desktop stands in for the user's desktop: an environment, a cache
// directory, and an opener that reports the file it was handed.
type desktop struct {
	browser.Opener
	// opened receives the arguments of each start of the opener.
	opened chan []string
}

// newDesktop returns a Linux desktop with the environment env whose opener
// fails with startErr.
func newDesktop(t *testing.T, env map[string]string, startErr error) *desktop {
	t.Helper()
	cache := t.TempDir()
	d := &desktop{opened: make(chan []string, 1)}
	d.Opener = browser.Opener{
		GOOS:     "linux",
		Getenv:   func(name string) string { return env[name] },
		CacheDir: func() (string, error) { return cache, nil },
		Start: func(name string, args ...string) error {
			d.opened <- append([]string{name}, args...)
			return startErr
		},
	}
	return d
}

// patience is how long a test waits for a step of sdash that it cannot go
// on without. It is far more than any step needs, and what it is for is the
// step that never happens: the test then fails and says which, where a bare
// wait would hang until the timeout of the test binary.
const patience = 30 * time.Second

// await returns the arguments the opener was started with. When it is never
// started it fails the test, where a bare receive would hang.
func (d *desktop) await(t *testing.T) []string {
	t.Helper()
	select {
	case started := <-d.opened:
		return started
	case <-time.After(patience):
		require.FailNow(t, "timed out waiting for the opener to be started")
		return nil
	}
}

// withDisplay is the environment of a session on a desktop.
func withDisplay() map[string]string {
	return map[string]string{"WAYLAND_DISPLAY": "wayland-0"}
}

// launched is an sdash that runs in a goroutine of the test.
type launched struct {
	// address is what sdash printed: where it serves, with the token.
	address string
	stderr  *output
	cancel  context.CancelFunc
	exit    chan int
}

// stop interrupts sdash as a signal would and returns its exit code.
func (l *launched) stop() int {
	l.cancel()
	code := <-l.exit
	// A second call, as the cleanup makes, finds the code again.
	l.exit <- code
	return code
}

// begin starts sdash as the process p, whose streams it sets, and returns
// it with what it prints. The caller reads until sdash has said where it
// serves (said).
func begin(t *testing.T, p Process) (*launched, *bufio.Reader) {
	t.Helper()
	stdout, written := io.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	l := &launched{stderr: &output{}, cancel: cancel, exit: make(chan int, 1)}
	p.Stdout, p.Stderr = written, l.stderr
	go func() {
		code := run(ctx, p, serve)
		_ = written.Close()
		l.exit <- code
	}()
	t.Cleanup(func() { l.stop() })
	return l, bufio.NewReader(stdout)
}

// said returns what sdash prints up to the first line that ends in last,
// that line included, which is how it says where it serves. What it prints
// after that is read and dropped: nothing is expected, but a write that
// nobody reads would block.
//
// A sdash that serves without having printed that line would have the read
// wait for ever. It is interrupted after patience instead, which ends its
// output, and the test fails with what was printed.
func (l *launched) said(t *testing.T, stdout *bufio.Reader, last string) string {
	t.Helper()
	silent := time.AfterFunc(patience, l.cancel)
	defer silent.Stop()

	var printed strings.Builder
	for !strings.HasSuffix(printed.String(), last) {
		line, err := stdout.ReadString('\n')
		require.NoError(t, err, "sdash ended, or was stopped after %v, before it had said where it serves: %s%s",
			patience, printed.String(), l.stderr)
		printed.WriteString(line)
	}
	go func() { _, _ = io.Copy(io.Discard, stdout) }()
	return printed.String()
}

// runToItsEnd runs the command line of p as the program does and returns
// its exit code. It is for a command line that has to end by itself. One
// that starts to serve instead would run for as long as the test does, so
// it is interrupted after patience, and the test fails for that.
func runToItsEnd(t *testing.T, p Process) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), patience)
	defer cancel()

	code := run(ctx, p, serve)

	require.NoError(t, ctx.Err(), "sdash did not end by itself and was stopped after %v", patience)
	return code
}

// launch starts sdash with args on a free loopback port and returns once it
// has printed its address.
func launch(t *testing.T, d *desktop, args ...string) *launched {
	t.Helper()
	l, stdout := begin(t, Process{
		Args:    append([]string{"--listen", "127.0.0.1:0"}, args...),
		Browser: d.Opener,
	})

	line := l.said(t, stdout, "\n")

	address, found := strings.CutPrefix(strings.TrimSuffix(line, "\n"), "sdash is serving at ")
	require.True(t, found, "the first line of the output is %q", line)
	l.address = address
	return l
}

// page is what a browser ends up with after opening an address.
type page struct {
	status int
	header http.Header
	// query is the query of the address the browser arrived at, after any
	// redirect.
	query string
	body  string
}

// open fetches an address as a browser does, cookies and redirects
// included.
func open(t *testing.T, address string) page {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	client := &http.Client{Jar: jar}
	t.Cleanup(client.CloseIdleConnections)

	resp, err := client.Get(address)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return page{status: resp.StatusCode, header: resp.Header, query: resp.Request.URL.RawQuery, body: string(body)}
}

// The contract of the default command, end to end: it prints an address
// that works, serves until it is interrupted, and then exits 0 without
// having said anything on standard error.
func TestTheServerRunsUntilItIsInterruptedAndExitsZero(t *testing.T) {
	t.Parallel()

	sdash := launch(t, newDesktop(t, nil, nil), "--no-browser")

	u, err := url.Parse(sdash.address)
	require.NoError(t, err)
	assert.Equal(t, "http", u.Scheme)
	assert.True(t, net.ParseIP(u.Hostname()).IsLoopback())
	assert.NotEmpty(t, u.Query().Get("token"))

	got := open(t, sdash.address)
	// Whether the interface is part of this build depends on whether
	// "make build" ran; that a page of sdash answers does not.
	assert.Contains(t, got.header.Get("Content-Type"), "text/html")
	assert.NotEmpty(t, got.header.Get("Content-Security-Policy"))
	assert.Empty(t, got.query, "the token has left the address")

	assert.Equal(t, exitcode.OK, sdash.stop())
	assert.Empty(t, sdash.stderr.String())
}

// The file is how the token reaches the browser without appearing in an
// argument list, and it holds the token, so it goes when the server does.
func TestTheBrowserIsOpenedOnAFileThatIsRemovedAtTheEnd(t *testing.T) {
	t.Parallel()

	d := newDesktop(t, withDisplay(), nil)
	sdash := launch(t, d)

	started := d.await(t)
	require.Len(t, started, 2)
	assert.Equal(t, "xdg-open", started[0])
	file := started[1]
	assert.NotContains(t, strings.Join(started, " "), "token")
	page, err := os.ReadFile(file)
	require.NoError(t, err)
	assert.Contains(t, string(page), sdash.address)

	require.Equal(t, exitcode.OK, sdash.stop())
	assert.NoFileExists(t, file)
}

func TestNoBrowserIsOpenedWhereTheUserWouldNotSeeIt(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		env  map[string]string
		args []string
		says string
	}{
		{name: "with --no-browser", env: withDisplay(), args: []string{"--no-browser", "-v"}},
		{
			name: "under SSH",
			env:  map[string]string{"SSH_CONNECTION": "192.0.2.1 50000 192.0.2.2 22", "DISPLAY": "localhost:10.0"},
			args: []string{"-v"},
			says: `msg="not opening a browser" reason="the session runs under SSH"`,
		},
		{
			name: "without a display",
			args: []string{"-v"},
			says: `msg="not opening a browser" reason="neither DISPLAY nor WAYLAND_DISPLAY is set"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			d := newDesktop(t, tt.env, nil)
			sdash := launch(t, d, tt.args...)

			// The address is printed all the same, and it works.
			got := open(t, sdash.address)
			assert.Contains(t, got.header.Get("Content-Type"), "text/html")

			require.Equal(t, exitcode.OK, sdash.stop())
			assert.Empty(t, d.opened, "the opener was not started")
			assert.Contains(t, sdash.stderr.String(), tt.says)
		})
	}
}

// A desktop without xdg-open, or one that fails, is no reason to stop a
// server whose address is on the terminal.
func TestAnOpenerThatFailsDoesNotStopTheServer(t *testing.T) {
	t.Parallel()

	d := newDesktop(t, withDisplay(), errors.New("executable file not found in $PATH"))
	sdash := launch(t, d)
	d.await(t)

	got := open(t, sdash.address)
	assert.Contains(t, got.header.Get("Content-Type"), "text/html")

	require.Equal(t, exitcode.OK, sdash.stop())
	assert.Contains(t, sdash.stderr.String(), `level=WARN msg="cannot open a browser"`)
	assert.Contains(t, sdash.stderr.String(), "executable file not found")
}

// The fallback changes the address the user has to open, so it is said
// without -v: a warning, which the default level shows.
func TestABusyPortIsReportedWithoutAnyVFlag(t *testing.T) {
	t.Parallel()

	holder, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = holder.Close() })
	busy := holder.Addr().String()

	// The later --listen wins over the one launch puts first.
	sdash := launch(t, newDesktop(t, nil, nil), "--no-browser", "--listen", busy)

	u, err := url.Parse(sdash.address)
	require.NoError(t, err)
	assert.NotEqual(t, busy, u.Host)
	got := open(t, sdash.address)
	assert.Contains(t, got.header.Get("Content-Type"), "text/html")

	require.Equal(t, exitcode.OK, sdash.stop())
	assert.Contains(t, sdash.stderr.String(), "level=WARN")
	assert.Contains(t, sdash.stderr.String(), "wanted="+busy)
	assert.Contains(t, sdash.stderr.String(), "address="+u.Host)
}

// --dev is the development loop: the interface comes from web/dist in the
// working directory, so that a rebuild shows without recompiling sdash.
// The test changes the working directory and therefore does not run in
// parallel.
func TestDevServesTheInterfaceFromWebDistOnDisk(t *testing.T) {
	const built = "<!doctype html><title>built on disk</title>"
	root := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(root, "web", "dist"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(root, "web", "dist", "index.html"), []byte(built), 0o644))
	t.Chdir(root)

	sdash := launch(t, newDesktop(t, nil, nil), "--dev", "--no-browser")

	got := open(t, sdash.address)
	assert.Equal(t, http.StatusOK, got.status)
	assert.Equal(t, built, got.body)

	// With --dev a request the Vite dev server proxies is accepted.
	assert.Equal(t, http.StatusOK, proxiedByVite(t, sdash))

	assert.Equal(t, exitcode.OK, sdash.stop())
}

// Without --dev the same request is one from another origin.
func TestWithoutDevARequestFromTheViteDevServerIsRefused(t *testing.T) {
	t.Parallel()

	sdash := launch(t, newDesktop(t, nil, nil), "--no-browser")

	assert.Equal(t, http.StatusForbidden, proxiedByVite(t, sdash))

	assert.Equal(t, exitcode.OK, sdash.stop())
}

// proxiedByVite signs a browser in and returns the status of a call to the
// API as the proxy of the Vite dev server hands it on: under the server's
// own name, with the session cookie, from a page of the dev server's
// origin (web/vite.config.ts).
func proxiedByVite(t *testing.T, sdash *launched) int {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	client := &http.Client{Jar: jar}
	t.Cleanup(client.CloseIdleConnections)
	signedIn, err := client.Get(sdash.address)
	require.NoError(t, err)
	require.NoError(t, signedIn.Body.Close())

	address, err := url.Parse(sdash.address)
	require.NoError(t, err)
	proxied, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
		"http://"+address.Host+server.APIPrefix+"/status", nil)
	require.NoError(t, err)
	proxied.Header.Set("Origin", "http://127.0.0.1:5173")
	proxied.Header.Set("Sec-Fetch-Site", "same-origin")
	answer, err := client.Do(proxied)
	require.NoError(t, err)
	require.NoError(t, answer.Body.Close())
	return answer.StatusCode
}

// The default address is the name localhost, which binds both loopback
// addresses. The address sdash prints, and opens, keeps the literal form:
// it leads to sdash whatever a resolver makes of the name.
func TestLocalhostIsPrintedAsTheLiteralLoopbackAddress(t *testing.T) {
	t.Parallel()

	sdash := launch(t, newDesktop(t, nil, nil), "--no-browser", "--listen", "localhost:0")

	u, err := url.Parse(sdash.address)
	require.NoError(t, err)
	assert.Equal(t, "127.0.0.1", u.Hostname())
	got := open(t, sdash.address)
	assert.Contains(t, got.header.Get("Content-Type"), "text/html")

	assert.Equal(t, exitcode.OK, sdash.stop())
	// Nothing to warn about, on a machine with an IPv6 loopback address
	// or without one.
	assert.Empty(t, sdash.stderr.String())
}
