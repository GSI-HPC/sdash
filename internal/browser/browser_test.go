// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package browser

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testToken  = "LAUNCHTOKENLAUNCHTOKENLAUNCH"
	testTarget = "http://127.0.0.1:7374/?token=" + testToken
)

// The test binary stands in for the desktop's opener: it is the one program
// certain to exist wherever the tests run. Called with standIn and a
// directory, it behaves as an opener that stays the parent of the browser it
// launched, which is what xdg-open can do.
const (
	standIn = "stand-in-for-the-opener"
	// groupFile is where the stand-in writes its process group once it runs.
	groupFile = "group"
	// releaseFile is what the stand-in waits for before it exits.
	releaseFile = "release"
	// endFile is where the stand-in writes how it ended.
	endFile = "end"
	// standInPatience is how long the stand-in waits to be released, so that
	// a failing test leaves no process behind.
	standInPatience = 10 * time.Second
)

func TestMain(m *testing.M) {
	if len(os.Args) == 3 && os.Args[1] == standIn {
		os.Exit(standInOpener(os.Args[2]))
	}
	os.Exit(m.Run())
}

// standInOpener writes its process group into dir, waits there for the
// release file, and writes whether it was released or gave up waiting.
func standInOpener(dir string) int {
	if err := writeWhole(filepath.Join(dir, groupFile), strconv.Itoa(syscall.Getpgrp())); err != nil {
		return 1
	}
	end := "gave up"
	for deadline := time.Now().Add(standInPatience); time.Now().Before(deadline); time.Sleep(5 * time.Millisecond) {
		if _, err := os.Stat(filepath.Join(dir, releaseFile)); err == nil {
			end = "released"
			break
		}
	}
	if err := writeWhole(filepath.Join(dir, endFile), end); err != nil {
		return 1
	}
	return 0
}

// writeWhole puts content into file in one step, so that a reader that finds
// the file finds all of it.
func writeWhole(file, content string) error {
	if err := os.WriteFile(file+".part", []byte(content), 0o600); err != nil {
		return err
	}
	return os.Rename(file+".part", file)
}

// startStandIn has start run the stand-in and returns the directory the two
// talk through, once start has returned. The stand-in is released when the
// test ends, if the test has not done so itself.
func startStandIn(t *testing.T) string {
	t.Helper()
	self, err := os.Executable()
	require.NoError(t, err)
	dir := t.TempDir()

	require.NoError(t, start(self, standIn, dir))

	// Registered after the directory, so it runs before the directory is
	// removed: the stand-in still writes into it on its way out.
	t.Cleanup(func() {
		release(t, dir)
		readWhenWritten(t, filepath.Join(dir, endFile))
	})
	return dir
}

// release lets the stand-in that talks through dir exit.
func release(t *testing.T, dir string) {
	t.Helper()
	require.NoError(t, os.WriteFile(filepath.Join(dir, releaseFile), nil, 0o600))
}

// readWhenWritten returns what the stand-in wrote into file, waiting for it
// for as long as the stand-in itself can take.
func readWhenWritten(t *testing.T, file string) string {
	t.Helper()
	var content []byte
	require.Eventually(t, func() bool {
		var err error
		content, err = os.ReadFile(file)
		return err == nil
	}, 2*standInPatience, 5*time.Millisecond, "the stand-in never wrote %s", file)
	return string(content)
}

// started records what a fake opener was asked to run.
type started struct {
	name string
	args []string
}

// fakeOpener returns an Opener for goos whose environment is env, whose
// cache directory is a fresh temporary one, and whose Start records its
// call in the returned value and fails with startErr.
func fakeOpener(t *testing.T, goos string, env map[string]string, startErr error) (Opener, *started, string) {
	t.Helper()
	cache := t.TempDir()
	call := &started{}
	return Opener{
		GOOS:     goos,
		Getenv:   func(name string) string { return env[name] },
		CacheDir: func() (string, error) { return cache, nil },
		Start: func(name string, args ...string) error {
			call.name, call.args = name, args
			return startErr
		},
	}, call, cache
}

// A browser started where the user cannot see it is worse than none: under
// SSH it opens on the remote host, and without a display the opener fails
// or falls back to a text browser that takes over the terminal.
func TestSkipSaysWhenNoBrowserCanBeOpenedHere(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		goos string
		env  map[string]string
		want string
	}{
		{name: "an X11 desktop on Linux can open one", goos: "linux", env: map[string]string{"DISPLAY": ":0"}},
		{name: "a Wayland desktop on Linux can open one", goos: "linux", env: map[string]string{"WAYLAND_DISPLAY": "wayland-0"}},
		{name: "macOS needs no display variable", goos: "darwin"},
		{
			name: "Linux without a display cannot",
			goos: "linux",
			want: "neither DISPLAY nor WAYLAND_DISPLAY is set",
		},
		{
			// X11 forwarding sets DISPLAY on the remote host; the browser
			// would still be the remote one.
			name: "an SSH session cannot, even with a display",
			goos: "linux",
			env:  map[string]string{"SSH_CONNECTION": "192.0.2.1 50000 192.0.2.2 22", "DISPLAY": "localhost:10.0"},
			want: "the session runs under SSH",
		},
		{
			name: "an SSH session on macOS cannot",
			goos: "darwin",
			env:  map[string]string{"SSH_CONNECTION": "192.0.2.1 50000 192.0.2.2 22"},
			want: "the session runs under SSH",
		},
		{name: "a system without a known opener cannot", goos: "plan9", want: "no opener is known for plan9"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			o, _, _ := fakeOpener(t, tt.goos, tt.env, nil)

			assert.Equal(t, tt.want, o.Skip())
		})
	}
}

// The argument list of a process is readable by every user of the host, so
// the token must reach the browser through the file alone.
func TestOpenHandsTheOpenerAFileAndNeverTheToken(t *testing.T) {
	t.Parallel()

	for goos, command := range map[string]string{"linux": "xdg-open", "darwin": "open"} {
		t.Run(goos, func(t *testing.T) {
			t.Parallel()

			o, call, cache := fakeOpener(t, goos, nil, nil)

			file, err := o.Open(testTarget)
			require.NoError(t, err)

			assert.Equal(t, command, call.name)
			assert.Equal(t, []string{file}, call.args)
			assert.NotContains(t, strings.Join(call.args, " "), testToken)
			assert.Equal(t, filepath.Join(cache, "sdash", "open-7374.html"), file)

			page, err := os.ReadFile(file)
			require.NoError(t, err)
			assert.Contains(t, string(page), `content="0; url=`+testTarget+`"`)
			assert.Contains(t, string(page), `href="`+testTarget+`"`)
		})
	}
}

// The file holds the token, so no other user may read it or list the
// directory it lies in.
func TestOpenWritesAFileOnlyItsOwnerCanRead(t *testing.T) {
	t.Parallel()

	o, _, cache := fakeOpener(t, "linux", nil, nil)

	file, err := o.Open(testTarget)
	require.NoError(t, err)

	info, err := os.Stat(file)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())

	info, err = os.Stat(filepath.Join(cache, "sdash"))
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o700), info.Mode().Perm())
}

// A directory or a file left behind with a wider mode, by an earlier run or
// by anything else, must not be what the token is written into.
func TestOpenClosesWhatAnEarlierRunLeftOpen(t *testing.T) {
	t.Parallel()

	o, _, cache := fakeOpener(t, "linux", nil, nil)
	dir := filepath.Join(cache, "sdash")
	stale := filepath.Join(dir, "open-7374.html")
	require.NoError(t, os.MkdirAll(dir, 0o755))
	require.NoError(t, os.Chmod(dir, 0o755))
	require.NoError(t, os.WriteFile(stale, []byte("stale"), 0o644))
	require.NoError(t, os.Chmod(stale, 0o644))

	file, err := o.Open(testTarget)
	require.NoError(t, err)
	require.Equal(t, stale, file)

	info, err := os.Stat(file)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())
	info, err = os.Stat(dir)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o700), info.Mode().Perm())

	page, err := os.ReadFile(file)
	require.NoError(t, err)
	assert.NotContains(t, string(page), "stale")
}

// The address is written into HTML attributes; a character that ends one
// would let the rest of the address become markup.
func TestOpenEscapesTheAddressInThePage(t *testing.T) {
	t.Parallel()

	o, _, _ := fakeOpener(t, "linux", nil, nil)

	file, err := o.Open(`http://127.0.0.1:7374/?token=a"><script>alert(1)</script>&x=1`)
	require.NoError(t, err)

	page, err := os.ReadFile(file)
	require.NoError(t, err)
	assert.NotContains(t, string(page), "<script>")
	assert.Contains(t, string(page), "&#34;&gt;&lt;script&gt;")
}

// When the opener cannot be started nothing will ever read the file, and a
// token must not lie on disk for nothing.
func TestOpenRemovesTheFileWhenTheOpenerDoesNotStart(t *testing.T) {
	t.Parallel()

	failure := errors.New("exec: \"xdg-open\": executable file not found in $PATH")
	o, _, cache := fakeOpener(t, "linux", nil, failure)

	_, err := o.Open(testTarget)

	require.ErrorIs(t, err, failure)
	assert.NoFileExists(t, filepath.Join(cache, "sdash", "open-7374.html"))
}

func TestOpenReportsWhatItCannotDo(t *testing.T) {
	t.Parallel()

	t.Run("a system without a known opener", func(t *testing.T) {
		t.Parallel()

		o, call, _ := fakeOpener(t, "plan9", nil, nil)

		_, err := o.Open(testTarget)

		require.ErrorContains(t, err, "no opener is known for plan9")
		assert.Empty(t, call.name)
	})

	t.Run("a user without a cache directory", func(t *testing.T) {
		t.Parallel()

		noHome := errors.New("neither $XDG_CACHE_HOME nor $HOME are defined")
		o, call, _ := fakeOpener(t, "linux", nil, nil)
		o.CacheDir = func() (string, error) { return "", noHome }

		_, err := o.Open(testTarget)

		require.ErrorIs(t, err, noHome)
		assert.Empty(t, call.name)
	})

	t.Run("an address that is none", func(t *testing.T) {
		t.Parallel()

		o, call, _ := fakeOpener(t, "linux", nil, nil)

		_, err := o.Open("http://127.0.0.1:port/")

		require.Error(t, err)
		assert.Empty(t, call.name)
	})
}

// System is what the program runs with; a field left unset there would be a
// nil call at the first launch.
func TestSystemFillsEveryField(t *testing.T) {
	t.Parallel()

	o := System()

	assert.NotEmpty(t, o.GOOS)
	assert.NotNil(t, o.Getenv)
	assert.NotNil(t, o.CacheDir)
	assert.NotNil(t, o.Start)
}

// xdg-open can stay alive for as long as the browser it launched. sdash
// opens the browser before it serves, so a start that waited for the opener
// would leave the page hanging on a listener nobody answers.
func TestStartReturnsWhileTheOpenerStillRuns(t *testing.T) {
	t.Parallel()

	dir := startStandIn(t)

	// The stand-in exits only when it is released, and it is released only
	// here, after start has returned. A start that waited would return when
	// the stand-in had given up.
	release(t, dir)
	assert.Equal(t, "released", readWhenWritten(t, filepath.Join(dir, endFile)))
}

// Ctrl-C in the terminal goes to the whole foreground process group. An
// opener in sdash's group would receive it too, and take with it a browser
// that it is the parent of, with every tab the user had open.
func TestStartKeepsTheOpenerOutOfTheProcessGroupOfSdash(t *testing.T) {
	t.Parallel()

	dir := startStandIn(t)

	group, err := strconv.Atoi(readWhenWritten(t, filepath.Join(dir, groupFile)))
	require.NoError(t, err)

	assert.NotEqual(t, syscall.Getpgrp(), group)
}

func TestStartReportsAnOpenerThatIsNotInstalled(t *testing.T) {
	t.Parallel()

	err := start(filepath.Join(t.TempDir(), "no-such-opener"))

	require.ErrorIs(t, err, os.ErrNotExist)
}
