// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/server/servertest"
)

// socketDir returns a directory of the test's own for a socket: one the
// user alone may write to, and short enough for a socket path.
func socketDir(t *testing.T) string {
	t.Helper()
	return servertest.SocketDir(t, func(dir string) bool {
		// The deepest path a test puts a socket at below the directory.
		return CheckListen(UnixScheme+filepath.Join(dir, "a", "b", "c", "sdash.sock")) == nil
	})
}

// listenOn listens on a socket at path as the server does, and closes the
// listener when the test ends.
func listenOn(t *testing.T, path string) (net.Listener, error) {
	t.Helper()
	listener, err := listenSocket(t.Context(), systemBind, path)
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = listener.Close() })
	return listener, nil
}

// answers reports whether something accepts a connection on the socket at
// path.
func answers(t *testing.T, path string) bool {
	t.Helper()
	conn, err := net.Dial("unix", path)
	if err != nil {
		return false
	}
	require.NoError(t, conn.Close())
	return true
}

// leftBehind puts a socket at path that nobody listens on, as a sdash that
// was killed leaves it.
func leftBehind(t *testing.T, path string) {
	t.Helper()
	listener, err := net.Listen("unix", path)
	require.NoError(t, err)
	listener.(*net.UnixListener).SetUnlinkOnClose(false)
	require.NoError(t, listener.Close())
	require.False(t, answers(t, path))
}

// entries returns the names in a directory.
func entries(t *testing.T, dir string) []string {
	t.Helper()
	found, err := os.ReadDir(dir)
	require.NoError(t, err)
	names := []string{}
	for _, entry := range found {
		names = append(names, entry.Name())
	}
	return names
}

// Whoever can connect to the socket can try the launch token on it, and on a
// shared host that must be nobody but the user.
func TestTheSocketIsOpenToItsOwnerAlone(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")

	listener, err := listenOn(t, path)
	require.NoError(t, err)

	info, err := os.Lstat(path)
	require.NoError(t, err)
	assert.Equal(t, fs.ModeSocket, info.Mode().Type())
	assert.Equal(t, fs.FileMode(0o600), info.Mode().Perm())
	assert.Equal(t, &net.UnixAddr{Name: path, Net: "unix"}, listener.Addr())
	assert.True(t, answers(t, path))
	assert.Equal(t, []string{"sdash.sock"}, entries(t, dir), "nothing but the socket is left in its directory")
}

// A socket that is bound where it will lie has, until its mode is changed,
// whatever mode the umask gives it, and under a loose umask others could
// connect in that moment. So the socket comes into being where nobody else
// can reach it, and appears under its name with its final mode.
func TestTheSocketIsNeverSeenUnderItsNameWithALooserMode(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	// The directory of the socket may be one others can look into.
	require.NoError(t, os.Chmod(dir, 0o755))
	path := filepath.Join(dir, "sdash.sock")
	var bound atomic.Int32
	// What the system would do under the loosest umask: a socket that
	// everyone may write to as soon as it is bound.
	looseUmask := func(ctx context.Context, network, address string) (net.Listener, error) {
		listener, err := systemBind(ctx, network, address)
		if err != nil {
			return nil, err
		}
		bound.Add(1)
		assert.NoError(t, os.Chmod(address, 0o777))

		assert.NotEqual(t, path, address, "the socket is not bound under its name")
		assert.NoFileExists(t, path, "nothing is at the name of the socket yet")
		staging, err := os.Lstat(filepath.Dir(address))
		if assert.NoError(t, err) {
			assert.True(t, staging.IsDir())
			assert.Equal(t, fs.FileMode(0o700), staging.Mode().Perm(), "nobody else can reach the socket where it is bound")
		}
		assert.Equal(t, dir, filepath.Dir(filepath.Dir(address)), "it is bound in the directory it will lie in, so that it can be renamed")
		return listener, nil
	}

	listener, err := listenSocket(t.Context(), looseUmask, path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	require.EqualValues(t, 1, bound.Load())
	info, err := os.Lstat(path)
	require.NoError(t, err)
	assert.Equal(t, fs.FileMode(0o600), info.Mode().Perm())
	assert.True(t, answers(t, path), "the socket still listens after it was moved")
	assert.Equal(t, []string{"sdash.sock"}, entries(t, dir), "the directory it was bound in is gone")
}

// The socket gets its mode before it gets its name. The other way round it
// would lie under its name, for a moment, with whatever mode the umask gave
// it. A move that fails shows which of the two came first.
func TestTheSocketIsClosedToOthersBeforeItIsMovedIntoPlace(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	staged := filepath.Join(dir, "s")
	listener, err := net.Listen("unix", staged)
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })
	require.NoError(t, os.Chmod(staged, 0o777))
	// A socket cannot take the place of a directory, so the move fails.
	path := filepath.Join(dir, "sdash.sock")
	require.NoError(t, os.Mkdir(path, 0o700))

	_, err = moveIntoPlace(staged, path)

	require.ErrorContains(t, err, "put the socket in its place")
	info, err := os.Lstat(staged)
	require.NoError(t, err)
	assert.Equal(t, fs.FileMode(0o600), info.Mode().Perm(), "the socket was closed to others where it was bound")
}

// The default socket lies in a directory of sdash's own below the runtime
// directory, which a first start has to create.
func TestTheDirectoryOfTheSocketIsCreatedClosedToOthers(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "a", "b", "s.sock")

	_, err := listenOn(t, path)
	require.NoError(t, err)

	for _, created := range []string{filepath.Join(dir, "a"), filepath.Join(dir, "a", "b")} {
		info, err := os.Stat(created)
		require.NoError(t, err)
		assert.Equal(t, fs.FileMode(0o700), info.Mode().Perm(), created)
	}
	assert.True(t, answers(t, path))
}

// Whoever may write to the directory of the socket can move the socket away
// and put a listener of their own under its name, which the user's forward
// then leads to. sdash does not serve from such a directory, and says why.
func TestADirectoryThatOthersCanWriteToIsRefused(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode fs.FileMode
		ok   bool
		says string
	}{
		{name: "the user alone", mode: 0o700, ok: true},
		{name: "others may look", mode: 0o755, ok: true},
		{name: "the group may write", mode: 0o770, says: "has the mode 0770: its group or everyone may write to it"},
		{name: "everyone may write", mode: 0o777, says: "has the mode 0777: its group or everyone may write to it"},
		{name: "everyone may write, as in a shared temporary directory", mode: 0o777 | fs.ModeSticky, says: "its group or everyone may write to it"},
		{name: "everyone but the group may write", mode: 0o707, says: "has the mode 0707"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dir := socketDir(t)
			require.NoError(t, os.Chmod(dir, tt.mode))
			path := filepath.Join(dir, "sdash.sock")

			_, err := listenOn(t, path)

			if tt.ok {
				require.NoError(t, err)
				assert.True(t, answers(t, path))
				return
			}
			require.ErrorContains(t, err, tt.says)
			require.ErrorContains(t, err, dir)
			assert.Empty(t, entries(t, dir), "nothing is created in a directory that is refused")
		})
	}
}

// A directory of another user is that user's to rearrange, whatever its
// mode says.
func TestADirectoryOfAnotherUserIsRefused(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	who := processOwners()

	resolved, err := privateDir(dir, who)
	require.NoError(t, err)
	assert.Equal(t, dir, resolved)
	// To the user with the next id, the directory is another user's.
	who.user++
	_, err = privateDir(dir, who)

	require.ErrorContains(t, err, "the directory of the socket, "+dir+", belongs to another user")
}

// Whoever may write to a directory above the socket's can move the
// directory below it away and put one of their own, with a listener in it,
// in its place. The forward opens the path anew for every connection, so
// that works at any time, and the listener is handed the launch token.
func TestASocketBelowADirectoryThatOthersCanWriteToIsRefused(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode fs.FileMode
		ok   bool
	}{
		{name: "the user alone", mode: 0o700, ok: true},
		{name: "others may look", mode: 0o755, ok: true},
		// Under the sticky bit nobody renames what belongs to another,
		// which is what lets a directory of the user's lie in /tmp.
		{name: "everyone may write, under the sticky bit", mode: 0o777 | fs.ModeSticky, ok: true},
		{name: "the group may write, under the sticky bit", mode: 0o770 | fs.ModeSticky, ok: true},
		{name: "the group may write", mode: 0o770},
		{name: "everyone may write", mode: 0o777},
		{name: "everyone but the group may write", mode: 0o707},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Not the directory the socket's lies in but the one above
			// that: every directory on the way counts.
			open := filepath.Join(socketDir(t), "a")
			require.NoError(t, os.Mkdir(open, 0o700))
			require.NoError(t, os.Chmod(open, tt.mode))
			path := filepath.Join(open, "b", "c", "sdash.sock")

			_, err := listenOn(t, path)

			if tt.ok {
				require.NoError(t, err)
				assert.True(t, answers(t, path))
				return
			}
			require.ErrorContains(t, err, fmt.Sprintf("%s, above the directory of the socket, has the mode %04o: "+
				"its group or everyone may write to it", open, tt.mode.Perm()))
			assert.NoFileExists(t, path)
		})
	}
}

// A directory above the socket's that belongs to another user is that
// user's to rearrange, whatever its mode says. The system's are not held
// against it: whoever runs sdash on a host trusts its root.
func TestADirectoryAboveTheSocketsBelongsToTheUserOrTheSystem(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	me := os.Geteuid()

	require.NoError(t, owners{user: me}.checkAbove(dir), "the user's own")
	require.NoError(t, owners{user: me + 1, system: []int{me}}.checkAbove(dir), "the system's")
	// To the user with the next id, on a host whose system is neither.
	err := owners{user: me + 1, system: []int{me + 2}}.checkAbove(dir)

	require.ErrorContains(t, err, dir+", above the directory of the socket, belongs to another user")
}

// In a sandbox that maps the user and nobody else, root has no id, and its
// directories appear under the one the kernel shows for every owner without
// one. A rule that knew root alone refused every socket there, the default
// one included.
func TestTheSystemIsRootAndWhatRootLooksLikeWhereThereIsNone(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		uidMap   string
		overflow string
		want     []int
	}{
		{
			name:     "the namespace a host starts with",
			uidMap:   "         0          0 4294967295\n",
			overflow: "65534\n",
			want:     []int{0},
		},
		{
			name:     "a sandbox that maps the user alone",
			uidMap:   "      1000       1000          1\n",
			overflow: "65534\n",
			want:     []int{0, 65534},
		},
		{
			name:     "a rootless container, whose root is the user",
			uidMap:   "         0       1000          1\n         1     100000      65536\n",
			overflow: "65534\n",
			want:     []int{0},
		},
		{
			name:     "a range that leaves root out",
			uidMap:   "         1     100000      65536\n",
			overflow: "65534\n",
			want:     []int{0, 65534},
		},
		{
			name:     "an overflow id of the site's choosing",
			uidMap:   "1000 1000 1\n",
			overflow: "99\n",
			want:     []int{0, 99},
		},
		{
			// The overflow id is then the id of a user like any other.
			name:     "a system without user namespaces",
			overflow: "65534\n",
			want:     []int{0},
		},
		{
			name: "a system that has neither file",
			want: []int{0},
		},
		{
			name:   "an overflow id that cannot be read",
			uidMap: "1000 1000 1\n",
			want:   []int{0},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, systemIDs(tt.uidMap, tt.overflow))
		})
	}
}

// A symbolic link on the way to the socket is a name that somebody may
// point elsewhere later, and the forward would follow it. The socket lies
// where the link leads, is judged there, and is reported without the link.
func TestALinkOnTheWayToTheSocketIsResolved(t *testing.T) {
	t.Parallel()

	top := socketDir(t)
	target := filepath.Join(top, "a")
	require.NoError(t, os.Mkdir(target, 0o700))
	// The link lies where everyone may write, and that is not held against
	// the directory it leads to.
	open := filepath.Join(top, "b")
	require.NoError(t, os.Mkdir(open, 0o700))
	require.NoError(t, os.Chmod(open, 0o777))
	link := filepath.Join(open, "c")
	require.NoError(t, os.Symlink(target, link))

	srv := start(t, Config{Listen: UnixScheme + filepath.Join(link, "sdash.sock")})

	assert.Equal(t, filepath.Join(target, "sdash.sock"), srv.Socket(), "the user is told the path without the link")
	assert.True(t, answers(t, filepath.Join(target, "sdash.sock")))
}

// The rules hold for where a link leads and not for where it lies.
func TestALinkToADirectoryBelowOneThatOthersCanWriteToIsRefused(t *testing.T) {
	t.Parallel()

	top := socketDir(t)
	open := filepath.Join(top, "a")
	require.NoError(t, os.Mkdir(open, 0o700))
	require.NoError(t, os.Chmod(open, 0o777))
	target := filepath.Join(open, "b")
	require.NoError(t, os.Mkdir(target, 0o700))
	link := filepath.Join(top, "c")
	require.NoError(t, os.Symlink(target, link))

	_, err := listenOn(t, filepath.Join(link, "sdash.sock"))

	require.ErrorContains(t, err, open+", above the directory of the socket, has the mode 0777")
	assert.Empty(t, entries(t, target), "nothing is bound there")
}

// The limit is that of the path the socket is bound at, and a link can lead
// to a longer one than the path that names it.
func TestALinkThatLeadsToAPathThatIsTooLongIsRefused(t *testing.T) {
	t.Parallel()

	top := socketDir(t)
	// A directory in which a socket named sdash.sock is one byte too long.
	long := filepath.Join(top, strings.Repeat("d", maxSocketPath+1-len(top)-len("/")-len("/sdash.sock")))
	require.NoError(t, os.Mkdir(long, 0o700))
	link := filepath.Join(top, "a")
	require.NoError(t, os.Symlink(long, link))
	path := filepath.Join(link, "sdash.sock")
	require.NoError(t, CheckListen(UnixScheme+path), "the path as it is given is short enough")

	_, err := listenOn(t, path)

	require.ErrorContains(t, err, "bytes long, and a unix socket on this system takes")
	require.ErrorContains(t, err, filepath.Join(long, "sdash.sock"))
	assert.Empty(t, entries(t, long), "nothing is bound there")
}

func TestADirectoryOfTheSocketThatIsNoDirectoryIsRefused(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	file := filepath.Join(dir, "file")
	require.NoError(t, os.WriteFile(file, []byte("kept"), 0o600))

	_, err := listenOn(t, filepath.Join(file, "sdash.sock"))

	require.ErrorContains(t, err, "create the directory of the socket")
	assert.Equal(t, []string{"file"}, entries(t, dir))
}

// A sdash that was killed could not remove its socket. The file answers
// nobody, and would keep the next sdash from starting if it were not
// replaced.
func TestASocketThatNobodyAnswersOnIsReplaced(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")
	leftBehind(t, path)
	stale, err := os.Lstat(path)
	require.NoError(t, err)

	_, err = listenOn(t, path)
	require.NoError(t, err)

	fresh, err := os.Lstat(path)
	require.NoError(t, err)
	assert.False(t, os.SameFile(stale, fresh), "the socket is a new one")
	assert.Equal(t, fs.FileMode(0o600), fresh.Mode().Perm())
	assert.True(t, answers(t, path))
	assert.Equal(t, []string{"sdash.sock"}, entries(t, dir))
}

// A socket that answers is a running sdash. Taking its name would cut it
// off from every forward that leads to it.
func TestASocketThatAnswersIsNotTaken(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")
	first, err := listenOn(t, path)
	require.NoError(t, err)
	before, err := os.Lstat(path)
	require.NoError(t, err)

	second, err := listenOn(t, path)

	require.ErrorContains(t, err, "another sdash is listening there")
	require.ErrorContains(t, err, path)
	assert.Nil(t, second)
	after, err := os.Lstat(path)
	require.NoError(t, err)
	assert.True(t, os.SameFile(before, after), "the socket of the first is still in its place")
	assert.True(t, answers(t, path))
	assert.Equal(t, []string{"sdash.sock"}, entries(t, dir))
	require.NoError(t, first.Close())
}

// Only a socket that refuses a connection is one nobody listens on. One that
// neither takes nor refuses it is in use in a way sdash cannot see: a
// socket of another kind, or a listener too busy to accept. Replacing it
// would take the name from whoever is behind it.
func TestASocketThatNeitherAnswersNorRefusesIsNotReplaced(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")
	// A datagram socket takes no connection, and says so in its own way.
	other, err := net.ListenUnixgram("unixgram", &net.UnixAddr{Name: path, Net: "unixgram"})
	require.NoError(t, err)
	t.Cleanup(func() { _ = other.Close() })
	before, err := os.Lstat(path)
	require.NoError(t, err)

	_, err = listenOn(t, path)

	require.ErrorContains(t, err, "find out whether the socket "+path+" is in use")
	after, err := os.Lstat(path)
	require.NoError(t, err)
	assert.True(t, os.SameFile(before, after), "the socket is the one that was there")
	assert.Equal(t, []string{"sdash.sock"}, entries(t, dir))
}

// Whatever else lies at the path was put there by someone, and removing it
// could lose them a file.
func TestWhatIsNoSocketIsNeitherReplacedNorRemoved(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		put  func(t *testing.T, path string)
	}{
		{
			name: "a file",
			put: func(t *testing.T, path string) {
				require.NoError(t, os.WriteFile(path, []byte("kept"), 0o600))
			},
		},
		{
			name: "a directory",
			put: func(t *testing.T, path string) {
				require.NoError(t, os.Mkdir(path, 0o700))
			},
		},
		{
			// Followed, the link would have sdash judge, and replace, a
			// file somewhere else.
			name: "a symbolic link to a socket nobody answers on",
			put: func(t *testing.T, path string) {
				target := filepath.Join(socketDir(t), "other.sock")
				leftBehind(t, target)
				require.NoError(t, os.Symlink(target, path))
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dir := socketDir(t)
			path := filepath.Join(dir, "sdash.sock")
			tt.put(t, path)
			before, err := os.Lstat(path)
			require.NoError(t, err)

			_, err = listenOn(t, path)

			require.ErrorContains(t, err, "exists and is not a socket")
			require.ErrorContains(t, err, path)
			after, err := os.Lstat(path)
			require.NoError(t, err)
			assert.True(t, os.SameFile(before, after))
			assert.Equal(t, before.Mode(), after.Mode())
			assert.Equal(t, []string{"sdash.sock"}, entries(t, dir))
		})
	}
}

// A socket file that stays behind looks like a server to whoever finds it.
func TestTheSocketIsRemovedWhenTheListenerCloses(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")
	listener, err := listenOn(t, path)
	require.NoError(t, err)

	require.NoError(t, listener.Close())

	assert.NoFileExists(t, path)
	assert.Empty(t, entries(t, dir))
	// The HTTP server closes a listener on more than one of its ways out.
	assert.ErrorIs(t, listener.Close(), net.ErrClosed)
}

// The user may remove the socket of a sdash and start another on the same
// path. When the first one stops, the file at the path is not its own any
// more.
func TestAListenerRemovesNoSocketButItsOwn(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")
	first, err := listenOn(t, path)
	require.NoError(t, err)
	require.NoError(t, os.Remove(path))
	_, err = listenOn(t, path)
	require.NoError(t, err)

	require.NoError(t, first.Close())

	assert.True(t, answers(t, path), "the socket of the second is still there and listens")
}

// The system has room for a socket path of about a hundred bytes and
// refuses a longer one with "invalid argument". The path is checked before
// anything is created, so that the refusal says what is wrong.
func TestASocketPathThatIsTooLongIsRefusedBeforeAnythingIsCreated(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	// A path of exactly n bytes below dir.
	ofLength := func(n int, name string) string {
		padding := n - len(dir) - len("/") - len("/") - len(name)
		require.Positive(t, padding)
		return filepath.Join(dir, strings.Repeat("d", padding), name)
	}

	t.Run("a path one byte too long", func(t *testing.T) {
		t.Parallel()

		path := ofLength(maxSocketPath+1, "sdash.sock")

		err := CheckListen(UnixScheme + path)
		require.ErrorContains(t, err, "bytes long, and a unix socket on this system takes")
		require.ErrorContains(t, err, path)

		srv, err := New(t.Context(), Config{Listen: UnixScheme + path, Files: builtFiles()})
		require.ErrorContains(t, err, "bytes long")
		assert.Nil(t, srv)
		assert.NoDirExists(t, filepath.Dir(path))

		// The limit is the system's own and not a guess below it: package
		// net refuses the same path.
		listener, err := net.Listen("unix", path)
		if err == nil {
			_ = listener.Close()
		}
		require.ErrorIs(t, err, syscall.EINVAL)
	})

	// The socket is bound under a short name in its directory before it
	// gets its own. With a name shorter than that one, the directory has to
	// leave room for it.
	t.Run("a directory that leaves no room to bind the socket in", func(t *testing.T) {
		t.Parallel()

		path := ofLength(maxSocketPath, "s")

		err := CheckListen(UnixScheme + path)
		require.ErrorContains(t, err, "is too long")
		require.ErrorContains(t, err, filepath.Dir(path))
	})

	t.Run("the longest path is bound", func(t *testing.T) {
		t.Parallel()

		path := ofLength(maxSocketPath, "sdash.sock")
		require.Len(t, path, maxSocketPath)
		require.NoError(t, CheckListen(UnixScheme+path))

		_, err := listenOn(t, path)

		require.NoError(t, err, "what the check accepts, the system binds")
		assert.True(t, answers(t, path))
	})
}

// socketClient returns an HTTP client that reaches the socket at path
// whatever address it is asked for, as a browser does through a forward,
// and that keeps cookies as a browser does.
func socketClient(t *testing.T, path string) *http.Client {
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

// The whole way in over a unix socket, as a browser goes it through a
// forward: the address with the token signs it in, under whatever port the
// forward has, and from then on the API answers.
func TestABrowserBehindAForwardIsSignedInOverTheSocket(t *testing.T) {
	t.Parallel()

	for _, forward := range []string{"127.0.0.1:7374", "127.0.0.1:18080", "localhost:8000"} {
		t.Run(forward, func(t *testing.T) {
			t.Parallel()

			path := filepath.Join(socketDir(t), "sdash.sock")
			stub := &apiStub{}
			srv := start(t, Config{Listen: UnixScheme + path, API: stub})
			client := socketClient(t, path)
			printed, err := url.Parse(srv.URL())
			require.NoError(t, err)
			// The user changes the port in the address to the one the
			// forward starts from.
			address := "http://" + forward + "/?" + printed.RawQuery
			api := "http://" + forward + "/api/v1/status"

			status, _ := get(t, client, api)
			require.Equal(t, http.StatusUnauthorized, status, "the API is closed before the browser has signed in")

			status, body := get(t, client, address)
			require.Equal(t, http.StatusOK, status)
			assert.Equal(t, indexBody, body)

			status, body = get(t, client, api)
			assert.Equal(t, http.StatusOK, status)
			assert.JSONEq(t, `{"stub":true}`, body)
			assert.Equal(t, []string{"GET /api/v1/status"}, stub.seen())

			status, _ = get(t, client, "http://rebind.example:7374/")
			assert.Equal(t, http.StatusForbidden, status, "a page that reaches the forward under its own domain")
		})
	}
}

// A server on a socket has no address a browser can open. It says where
// the socket is, and names the address behind a forward from the port a
// user of a local sdash knows.
func TestAServerOnASocketNamesItsSocketAndTheAddressBehindAForward(t *testing.T) {
	t.Parallel()

	path := filepath.Join(socketDir(t), "sdash.sock")

	socket := start(t, Config{Listen: UnixScheme + path})
	port := start(t, Config{})

	assert.Equal(t, path, socket.Socket())
	assert.Regexp(t, `^http://127\.0\.0\.1:7374/\?token=[A-Z2-7]{26,}$`, socket.URL())
	assert.Empty(t, port.Socket())
}

// A path is taken in its shortest form, so that what is checked, what is
// bound and what the user is told are one path.
func TestTheSocketPathIsCleaned(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)

	srv := start(t, Config{Listen: UnixScheme + dir + "//run/../sdash.sock"})

	assert.Equal(t, filepath.Join(dir, "sdash.sock"), srv.Socket())
	assert.True(t, answers(t, filepath.Join(dir, "sdash.sock")))
}

// Stopping the server is what removes the socket: the user who stops sdash
// leaves nothing behind for the next start to replace.
func TestStoppingTheServerRemovesItsSocket(t *testing.T) {
	t.Parallel()

	dir := socketDir(t)
	path := filepath.Join(dir, "sdash.sock")
	srv := start(t, Config{Listen: UnixScheme + path})
	status, _ := get(t, socketClient(t, path), srv.URL())
	require.Equal(t, http.StatusOK, status)

	require.NoError(t, srv.stop())

	assert.NoFileExists(t, path)
	assert.Empty(t, entries(t, dir))
}
