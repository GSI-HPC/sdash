// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/exitcode"
	"github.com/GSI-HPC/sdash/internal/server"
	"github.com/GSI-HPC/sdash/internal/server/servertest"
)

// endOfTheHint ends what a sdash on a unix socket prints, with a command to
// copy or without one.
const endOfTheHint = " and in the address alike.\n"

// privateDir returns a directory of the test's own for a socket: one the
// user alone may write to, and short enough for the default socket below
// it.
func privateDir(t *testing.T) string {
	t.Helper()
	return servertest.SocketDir(t, func(dir string) bool {
		return server.CheckListen(server.UnixScheme+filepath.Join(dir, socketDir, socketName)) == nil
	})
}

// launchOnSocket starts sdash as the process p, which names a unix socket
// in its arguments, and returns once it has printed how to reach it, with
// what it printed.
func launchOnSocket(t *testing.T, p Process) (*launched, string) {
	t.Helper()
	l, stdout := begin(t, p)
	return l, l.said(t, stdout, endOfTheHint)
}

// openThrough fetches an address as a browser behind a forward to the
// socket at path does: whatever the address, the connection goes to the
// socket. It returns the status, the Content-Type and the body.
func openThrough(t *testing.T, client *http.Client, address string) (int, string, string) {
	t.Helper()
	resp, err := client.Get(address)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, resp.Header.Get("Content-Type"), string(body)
}

// forwarded returns an HTTP client whose every connection goes to the
// socket at path, and that keeps cookies as a browser does.
func forwarded(t *testing.T, path string) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var dialer net.Dialer
			return dialer.DialContext(ctx, "unix", path)
		},
	}
	t.Cleanup(transport.CloseIdleConnections)
	return &http.Client{Jar: jar, Transport: transport}
}

// On a shared host the user's browser is on another machine, and a browser
// could not open a socket anyway. What the user needs is the command that
// brings a port of their own machine to the socket, and the address to open
// there. The test runs on a desktop where a browser would open, to show
// that none does.
func TestOnASocketTheForwardIsExplainedAndNoBrowserIsOpened(t *testing.T) {
	t.Parallel()

	d := newDesktop(t, withDisplay(), nil)
	path := filepath.Join(privateDir(t), "sdash.sock")

	sdash, hint := launchOnSocket(t, Process{
		Args:     []string{"--listen", "unix:" + path},
		Browser:  d.Opener,
		Hostname: func() (string, error) { return "login1.example.org", nil },
	})

	address := regexp.MustCompile(`http://127\.0\.0\.1:7374/\?token=[A-Z2-7]{26,}`).FindString(hint)
	require.NotEmpty(t, address, hint)
	assert.Equal(t, `sdash is serving on the unix socket `+path+`

A browser cannot open a unix socket. Run this on your own machine, the one
your browser is on, to forward a port of it to the socket:

    ssh -L 7374:`+path+` login1.example.org

Then open this address there, for as long as the command runs:

    `+address+`

The port 7374 is a suggestion. Any free port of your machine does, in the
command and in the address alike.
`, hint)

	// Only the user may connect.
	info, err := os.Lstat(path)
	require.NoError(t, err)
	assert.Equal(t, fs.ModeSocket|0o600, info.Mode())

	// The address works behind a forward, on the suggested port and, with
	// the port changed, on any other.
	for _, forward := range []string{address, strings.Replace(address, ":7374/", ":18080/", 1)} {
		client := forwarded(t, path)
		// Whether the interface is part of this build depends on whether
		// "make build" ran; that a page of sdash answers does not.
		_, contentType, _ := openThrough(t, client, forward)
		assert.Contains(t, contentType, "text/html")
		origin, _, _ := strings.Cut(forward, "/?")
		status, _, body := openThrough(t, client, origin+server.APIPrefix+"/status")
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, body, `"version"`)
	}

	require.Equal(t, exitcode.OK, sdash.stop())
	assert.Empty(t, d.opened, "the opener was not started")
	assert.NoFileExists(t, path, "the socket goes when sdash does")
	assert.Empty(t, sdash.stderr.String())
}

// The command is there to be copied. ssh reads the argument of -L as parts
// with colons between them, removes a backslash as the mark of an escape,
// and expands a percent sign and ${NAME}, so a command with such a path in
// it would be refused or would forward to a path that is not the socket's. sdash prints none then, says
// what is in the way, and still gives the address, which is the only place
// the token of the launch is to be had.
func TestASocketPathThatSSHCannotBeGivenGetsItsReasonAndNoCommand(t *testing.T) {
	t.Parallel()

	const (
		colon     = "It holds a colon, which ssh -L takes for the end of a part of its argument.\n"
		backslash = "It holds a backslash, which ssh -L takes for an escape and removes.\n"
		percent   = "It holds a percent sign, which ssh -L takes for the start of a token it expands.\n"
		variable  = "It holds ${, which ssh -L takes for an environment variable it expands.\n"
	)
	tests := []struct {
		name string
		// dir is a directory on the way to the socket, no longer than the
		// one of the default socket, which privateDir leaves room for.
		dir     string
		reasons string
	}{
		{name: "a colon", dir: "a:b", reasons: colon},
		{name: "a backslash", dir: `a\b`, reasons: backslash},
		{name: "a colon and a backslash", dir: `a:b\c`, reasons: colon + backslash},
		{name: "a percent sign", dir: "a%h", reasons: percent},
		{name: "a variable", dir: "${HOME}", reasons: variable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			path := filepath.Join(privateDir(t), tt.dir, "sdash.sock")

			sdash, hint := launchOnSocket(t, Process{
				Args:     []string{"--listen", "unix:" + path},
				Hostname: func() (string, error) { return "login1.example.org", nil },
			})

			address := regexp.MustCompile(`http://127\.0\.0\.1:7374/\?token=[A-Z2-7]{26,}`).FindString(hint)
			require.NotEmpty(t, address, hint)
			assert.Equal(t, `sdash is serving on the unix socket `+path+`

A browser cannot open a unix socket. A port of your own machine, the one
your browser is on, has to be forwarded to the socket, and sdash prints no
command for that here: the path of this socket cannot be given to ssh -L
as it is.
`+tt.reasons+`
Start sdash on a socket whose path ssh -L takes as it is, with
--listen unix:PATH, and it prints the command. With a forward of your
own to this socket, open this address on your machine, for as long as the
forward runs:

    `+address+`

The port 7374 is a suggestion. Any free port of your machine does, in the
forward and in the address alike.
`, hint)
			// Nothing in it reads as a command to run, the name of this host
			// included, which only a command has a use for.
			assert.NotContains(t, hint, "    ssh ")
			assert.NotContains(t, hint, "login1.example.org")

			// The socket is served like any other, and the address works
			// behind a forward of the user's own.
			_, contentType, _ := openThrough(t, forwarded(t, path), address)
			assert.Contains(t, contentType, "text/html")

			require.Equal(t, exitcode.OK, sdash.stop())
			assert.NoFileExists(t, path)
			assert.Empty(t, sdash.stderr.String())
		})
	}
}

// What decides between the two forms of the hint is the path alone: a
// command for every path that ssh -L takes as it is, a space or a quote in
// it included, which the shell is told of, and none for the others.
func TestTheForwardCommandIsPrintedForEveryPathSSHTakesAsItIs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		path    string
		command string
	}{
		{name: "plain characters", path: "/run/user/1000/sdash/sdash.sock", command: "    ssh -L 7374:/run/user/1000/sdash/sdash.sock login1\n"},
		{name: "a space", path: "/Users/a b/sdash.sock", command: "    ssh -L '7374:/Users/a b/sdash.sock' login1\n"},
		{name: "a quote", path: "/home/o'neill/sdash.sock", command: `    ssh -L '7374:/home/o'\''neill/sdash.sock' login1` + "\n"},
		{name: "a colon", path: "/home/a:b/sdash.sock"},
		{name: "a backslash", path: `/home/a\b/sdash.sock`},
		{name: "a backslash at its end", path: `/home/a/sdash.sock\`},
		{name: "a percent sign", path: "/home/per%cent/sdash.sock"},
		{name: "a variable", path: "/home/${USER}/sdash.sock"},
		{name: "a dollar sign alone", path: "/home/a$b/sdash.sock", command: "    ssh -L '7374:/home/a$b/sdash.sock' login1\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			hint := forwardHint(tt.path, "login1", "http://127.0.0.1:7374/?token=LAUNCHTOKEN")

			assert.True(t, strings.HasPrefix(hint, "sdash is serving on the unix socket "+tt.path+"\n"), hint)
			assert.Contains(t, hint, "\n    http://127.0.0.1:7374/?token=LAUNCHTOKEN\n")
			assert.True(t, strings.HasSuffix(hint, endOfTheHint), hint)
			if tt.command == "" {
				assert.NotContains(t, hint, "    ssh ")
				assert.Contains(t, hint, "cannot be given to ssh -L\nas it is.\nIt holds ")
				return
			}
			assert.Contains(t, hint, tt.command)
			assert.NotContains(t, hint, "cannot be given to ssh -L")
		})
	}
}

// "unix:" without a path is the socket a user does not have to think
// about: in the runtime directory, which belongs to the user alone, in a
// directory of sdash's own.
func TestUnixWithoutAPathIsTheSocketInTheRuntimeDirectory(t *testing.T) {
	t.Parallel()

	runtimeDir := privateDir(t)
	path := filepath.Join(runtimeDir, "sdash", "sdash.sock")

	sdash, hint := launchOnSocket(t, Process{
		Args:   []string{"--listen", "unix:"},
		Getenv: func(name string) string { return map[string]string{"XDG_RUNTIME_DIR": runtimeDir}[name] },
	})

	assert.True(t, strings.HasPrefix(hint, "sdash is serving on the unix socket "+path+"\n"), hint)
	// No machine name is known here; the command says what belongs there.
	assert.Contains(t, hint, "    ssh -L 7374:"+path+" <this host>\n")
	info, err := os.Stat(filepath.Dir(path))
	require.NoError(t, err)
	assert.Equal(t, fs.FileMode(0o700), info.Mode().Perm(), "the directory is closed to other users")
	info, err = os.Lstat(path)
	require.NoError(t, err)
	assert.Equal(t, fs.ModeSocket|0o600, info.Mode())

	require.Equal(t, exitcode.OK, sdash.stop())
	assert.NoFileExists(t, path)
}

// The forward opens the path it was given anew for every connection. A
// symbolic link in that path could be pointed elsewhere while sdash runs,
// so the command names the socket where it lies and not as it was asked
// for.
func TestTheForwardCommandNamesTheSocketWithoutALink(t *testing.T) {
	t.Parallel()

	dir := privateDir(t)
	target := filepath.Join(dir, "a")
	require.NoError(t, os.Mkdir(target, 0o700))
	link := filepath.Join(dir, "b")
	require.NoError(t, os.Symlink(target, link))
	path := filepath.Join(target, "sdash.sock")

	sdash, hint := launchOnSocket(t, Process{
		Args: []string{"--listen", "unix:" + filepath.Join(link, "sdash.sock")},
	})

	assert.True(t, strings.HasPrefix(hint, "sdash is serving on the unix socket "+path+"\n"), hint)
	assert.Contains(t, hint, "    ssh -L 7374:"+path+" <this host>\n")
	require.Equal(t, exitcode.OK, sdash.stop())
	assert.NoFileExists(t, path)
}

// A socket that cannot be opened is a failure of the server, with the
// reason, and nothing is printed that a user could try to open.
func TestASocketThatCannotBeOpenedEndsSdashWithTheReason(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		put  func(t *testing.T, dir, path string)
		says string
	}{
		{
			name: "a directory that others may write to",
			put: func(t *testing.T, dir, _ string) {
				require.NoError(t, os.Chmod(dir, 0o777))
			},
			says: "its group or everyone may write to it",
		},
		{
			name: "a file in its place",
			put: func(t *testing.T, _, path string) {
				require.NoError(t, os.WriteFile(path, []byte("kept"), 0o600))
			},
			says: "exists and is not a socket; sdash does not remove it",
		},
		{
			name: "another sdash on it",
			put: func(t *testing.T, _, path string) {
				launchOnSocket(t, Process{Args: []string{"--listen", "unix:" + path}})
			},
			says: "another sdash is listening there",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dir := privateDir(t)
			path := filepath.Join(dir, "sdash.sock")
			tt.put(t, dir, path)
			stdout, stderr := &output{}, &output{}

			code := runToItsEnd(t, Process{
				Args:   []string{"--listen", "unix:" + path},
				Stdout: stdout,
				Stderr: stderr,
			})

			assert.Equal(t, exitcode.Failure, code)
			assert.True(t, strings.HasPrefix(stderr.String(), "sdash: "), stderr.String())
			assert.Contains(t, stderr.String(), tt.says)
			assert.Empty(t, stdout.String())
		})
	}
}

// The path is printed for a command that runs on another machine, in
// whatever directory, so it is made absolute. A host and a port are no
// path and stay as they are.
func TestTheListenAddressIsHandedOnWithTheSocketPathInFull(t *testing.T) {
	t.Parallel()

	here, err := os.Getwd()
	require.NoError(t, err)
	runtime := func(name string) string {
		return map[string]string{"XDG_RUNTIME_DIR": "/run/user/1000"}[name]
	}
	tests := []struct {
		listen string
		want   string
	}{
		{listen: "localhost:7374", want: "localhost:7374"},
		{listen: "127.0.0.1:0", want: "127.0.0.1:0"},
		// What is no socket is the server's to judge.
		{listen: "nonsense", want: "nonsense"},
		{listen: "unix:/srv/sdash/sdash.sock", want: "unix:/srv/sdash/sdash.sock"},
		{listen: "unix:", want: "unix:/run/user/1000/sdash/sdash.sock"},
		{listen: "unix:run/sdash.sock", want: "unix:" + filepath.Join(here, "run", "sdash.sock")},
		{listen: "unix:./sdash.sock", want: "unix:" + filepath.Join(here, "sdash.sock")},
	}
	for _, tt := range tests {
		t.Run(tt.listen, func(t *testing.T) {
			t.Parallel()

			got, err := listenAddress(tt.listen, runtime)

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

// The command is there to be copied into a shell. A path the shell would
// split or expand has to arrive as one argument.
func TestTheForwardCommandIsOneArgumentToAShell(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		word string
		want string
	}{
		{name: "a path of plain characters", word: "7374:/run/user/1000/sdash/sdash.sock", want: "7374:/run/user/1000/sdash/sdash.sock"},
		{name: "a path with a space", word: "7374:/Users/a b/sdash.sock", want: "'7374:/Users/a b/sdash.sock'"},
		{name: "a path with a quote", word: "7374:/home/o'neill/sdash.sock", want: `'7374:/home/o'\''neill/sdash.sock'`},
		{name: "a path with a variable", word: "7374:/tmp/$HOME/sdash.sock", want: "'7374:/tmp/$HOME/sdash.sock'"},
		{name: "a path with a letter beyond ASCII", word: "7374:/home/jörg/sdash.sock", want: "'7374:/home/jörg/sdash.sock'"},
		{name: "nothing", word: "", want: "''"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, shellWord(tt.word))
		})
	}
}

// A machine that cannot say its name must not keep sdash from starting;
// the command then says what to put in the name's place.
func TestTheForwardCommandNamesTheMachineOrSaysWhatBelongsThere(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		hostname func() (string, error)
		want     string
	}{
		{name: "a name", hostname: func() (string, error) { return "login1", nil }, want: "login1"},
		{name: "no name", hostname: func() (string, error) { return "", nil }, want: "<this host>"},
		{name: "an error", hostname: func() (string, error) { return "", errors.New("no hostname") }, want: "<this host>"},
		{name: "a process that cannot ask", want: "<this host>"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, Process{Hostname: tt.hostname}.hostname())
		})
	}
}
