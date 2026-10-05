// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// A TCP port on loopback is open to every user of the host, and the origin
// it gives the interface is shared with them
// (doc/adr/0012-local-listener-security.md). A unix socket is a file: who
// may connect is decided by its mode, and who may put another socket under
// its name by the directory it lies in and by every directory above that.
// The rules below see to it that both are the user and nobody else
// (doc/adr/0023-the-listeners-as-built.md).

const (
	// maxSocketPath is the longest path a socket address takes on this
	// system: the path member of sockaddr_un less the NUL that ends it, 107
	// bytes on Linux and 103 on macOS.
	maxSocketPath = len(syscall.RawSockaddrUnix{}.Path) - 1

	// The socket is bound under stagedName in a directory that begins with
	// stagingPrefix and ends in stagingRandom characters, and then moved to
	// its place (listenSocket). The names are short because that path has to
	// fit a socket address too: together they are as long as "sdash.sock",
	// so the socket sdash names itself needs no more room for it.
	stagingPrefix = ".sd"
	stagingRandom = 5
	stagedName    = "s"
	// stagingTries bounds the search for a staging directory that does not
	// exist yet. A name is taken only by a second sdash that starts in the
	// same directory at the same moment, or by what a killed one left.
	stagingTries = 16

	// answerTimeout is how long a socket file that is already there gets to
	// accept a connection, which tells one in use from one left behind. A
	// local listener accepts at once or not at all.
	answerTimeout = time.Second
)

// cleanSocketPath returns the path of a unix listen address in the form it
// is checked in: the shortest that names the same file, without a doubled
// or a trailing slash. The socket is bound and reported under that path
// with the symbolic links on the way to it resolved (privateDir).
func cleanSocketPath(path string) string {
	return filepath.Clean(path)
}

// checkSocketPath reports why path cannot be the path of the listener's
// socket, as far as the path itself tells, or nil.
//
// The length is checked here so that a path that is too long is refused
// with its reason before anything is created. The system would refuse it
// too, with "invalid argument" and nothing else.
func checkSocketPath(path string) error {
	if path == "" {
		return fmt.Errorf("%q names no socket; give its path, as in %s/path/to/sdash.sock", UnixScheme, UnixScheme)
	}
	if !filepath.IsAbs(path) {
		return fmt.Errorf("the socket path %q is not absolute", path)
	}
	path = cleanSocketPath(path)
	if len(path) > maxSocketPath {
		return fmt.Errorf("the socket path %q is %d bytes long, and a unix socket on this system takes %d at most",
			path, len(path), maxSocketPath)
	}
	dir := filepath.Dir(path)
	staged := len(filepath.Join(dir, stagingPrefix, stagedName)) + stagingRandom
	if staged > maxSocketPath {
		return fmt.Errorf("the directory of the socket, %q, is too long: sdash binds the socket under a temporary name in it "+
			"first, a path of %d bytes, and a unix socket on this system takes %d at most", dir, staged, maxSocketPath)
	}
	return nil
}

// listenSocket listens on a unix socket at path, which checkSocketPath has
// accepted, and returns a listener that removes the socket when it closes.
// The listener says where the socket lies (socketListener.Addr): at path,
// with the symbolic links on the way to its directory resolved (privateDir).
//
// The socket is bound in a directory of its own that nobody else may enter,
// given its mode there, and then renamed to its place. So the file is
// readable and writable by its owner alone from the moment it exists under
// the name other users can see. Binding it in its place and changing the
// mode afterwards would leave the socket open, for a moment, to whomever
// the umask lets in. Setting the umask for the bind would close that window
// as well, but the umask belongs to the whole process, and this package
// sets nothing that does.
func listenSocket(ctx context.Context, bind bindFunc, path string) (*socketListener, error) {
	dir, err := privateDir(filepath.Dir(path), processOwners())
	if err != nil {
		return nil, err
	}
	path = filepath.Join(dir, filepath.Base(path))
	// A link may lead to a longer path than the one CheckListen measured,
	// which is known only now that the directory is there.
	if err := checkSocketPath(path); err != nil {
		return nil, err
	}
	if err := freeForSocket(ctx, path); err != nil {
		return nil, err
	}

	staging, err := makeStagingDir(dir)
	if err != nil {
		return nil, err
	}
	// The directory has done its part once the socket has left it, and
	// after a failure it may still hold the socket. One that cannot be
	// removed is an empty directory nobody else can enter.
	defer func() { _ = os.RemoveAll(staging) }()

	staged := filepath.Join(staging, stagedName)
	listener, err := bind(ctx, "unix", staged)
	if err != nil {
		return nil, fmt.Errorf("open the socket: %w", err)
	}
	if unix, ok := listener.(*net.UnixListener); ok {
		// Package net removes the file it bound when the listener closes,
		// by the name it was bound under. The socket will not be there any
		// more, and socketListener removes it where it is.
		unix.SetUnlinkOnClose(false)
	}
	created, err := moveIntoPlace(staged, path)
	if err != nil {
		// Nothing was accepted on it, and the staging directory takes the
		// file with it.
		_ = listener.Close()
		return nil, err
	}
	return &socketListener{Listener: listener, path: path, created: created}, nil
}

// moveIntoPlace closes the socket at staged to everyone but its owner and
// renames it to path. It returns the description of the file, by which
// socketListener knows it again.
//
// The rename replaces a socket that an earlier sdash left at path, in one
// step: there is no moment at which the name is free for another process to
// take.
func moveIntoPlace(staged, path string) (fs.FileInfo, error) {
	if err := os.Chmod(staged, 0o600); err != nil {
		return nil, fmt.Errorf("close the socket to other users: %w", err)
	}
	created, err := os.Lstat(staged)
	if err != nil {
		return nil, fmt.Errorf("open the socket: %w", err)
	}
	if err := os.Rename(staged, path); err != nil {
		return nil, fmt.Errorf("put the socket in its place: %w", err)
	}
	return created, nil
}

// owners says whose directories a socket may lie in and below.
type owners struct {
	// user is the id sdash runs as. The directory of the socket belongs to
	// this user.
	user int
	// system are the ids the directories above it may belong to as well:
	// root, and what root looks like where there is none (systemIDs).
	system []int
}

// processOwners returns the owners as they are for this process.
func processOwners() owners {
	// A system without user namespaces has neither file, and there root is
	// root.
	uidMap, _ := os.ReadFile("/proc/self/uid_map")
	overflow, _ := os.ReadFile("/proc/sys/kernel/overflowuid")
	return owners{user: os.Geteuid(), system: systemIDs(string(uidMap), string(overflow))}
}

// systemIDs returns the ids under which a process sees the directories of
// the system: 0, root, and in a user namespace without root also the id the
// kernel shows in place of every owner the namespace has no id for.
//
// uidMap is the content of /proc/self/uid_map, whose lines each map a range
// of ids of the namespace: its first id, the id outside that this stands
// for, and the length. overflow is the content of
// /proc/sys/kernel/overflowuid.
//
// A sandbox or a rootless container often maps the user and nobody else.
// Nothing belongs to 0 there: /, /run and /tmp appear under the overflow
// id, and a rule that asked for root would refuse every path, the default
// one in the runtime directory included. The price is that a directory of
// another user of the host appears under the same id. In such a namespace
// the mode of a directory above the socket's is checked and, in effect, its
// owner is not.
func systemIDs(uidMap, overflow string) []int {
	ids := []int{0}
	if uidMap == "" {
		// No user namespaces, so no owner without an id. The overflow id
		// may be set all the same, and is then a user like any other.
		return ids
	}
	for line := range strings.Lines(uidMap) {
		if fields := strings.Fields(line); len(fields) > 0 && fields[0] == "0" {
			// Root has an id here, and what belongs to it shows that id.
			return ids
		}
	}
	if id, err := strconv.Atoi(strings.TrimSpace(overflow)); err == nil {
		ids = append(ids, id)
	}
	return ids
}

// privateDir makes sure that nobody but the user can put a file into dir,
// the directory of the socket, or another directory in its place. It
// creates what is missing of dir, closed to everyone else, and returns dir
// with the symbolic links on the way to it resolved, which is where the
// socket is bound and what the user is told.
//
// Whoever may write to the directory can rename the socket away and put a
// listener of their own under its name, and whoever may write to a
// directory above it can do the same with the directory as a whole. The
// forward in front of the socket opens the path anew for every connection,
// so at any time it would hand that listener the launch token, and the
// origin of the interface in the user's browser with it. So:
//
//   - dir belongs to the user, and nobody but its owner may write to it.
//   - Every directory above it, up to the root, belongs to the user or to
//     the system, and nobody but its owner may write to it, unless it has
//     the sticky bit: there nobody renames an entry but the owner of the
//     entry and the owner of the directory, which is what lets a directory
//     of the user's lie in /tmp.
//   - A symbolic link can be pointed elsewhere by whoever may replace it.
//     The links are resolved first and the rules applied to the directories
//     they lead to. The socket is then named without them, so that the
//     forward the user starts follows no link either.
func privateDir(dir string, who owners) (string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create the directory of the socket: %w", err)
	}
	dir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return "", fmt.Errorf("resolve the directory of the socket: %w", err)
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return "", fmt.Errorf("look at the directory of the socket: %w", err)
	}
	if owner, ok := info.Sys().(*syscall.Stat_t); !ok || int(owner.Uid) != who.user {
		return "", fmt.Errorf("the directory of the socket, %s, belongs to another user, who could replace the socket; "+
			"name a socket in a directory of your own", dir)
	}
	if mode := info.Mode().Perm(); mode&0o022 != 0 {
		return "", fmt.Errorf("the directory of the socket, %s, has the mode %04o: its group or everyone may write to it, "+
			"and could replace the socket; remove that permission or name a socket in another directory", dir, mode)
	}
	for above := filepath.Dir(dir); ; above = filepath.Dir(above) {
		if err := who.checkAbove(above); err != nil {
			return "", err
		}
		if above == filepath.Dir(above) {
			return dir, nil
		}
	}
}

// checkAbove reports why dir, a directory above the socket's, lets somebody
// other than the user and the system replace what lies below it, or nil.
func (o owners) checkAbove(dir string) error {
	info, err := os.Lstat(dir)
	if err != nil {
		return fmt.Errorf("look at %s, above the directory of the socket: %w", dir, err)
	}
	owner, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(owner.Uid) != o.user && !slices.Contains(o.system, int(owner.Uid)) {
		return fmt.Errorf("%s, above the directory of the socket, belongs to another user, who could replace "+
			"everything below it, the socket included; name a socket below directories of your own", dir)
	}
	if mode := info.Mode(); mode.Perm()&0o022 != 0 && mode&fs.ModeSticky == 0 {
		return fmt.Errorf("%s, above the directory of the socket, has the mode %04o: its group or everyone may write "+
			"to it, and could replace everything below it, the socket included; remove that permission or name a "+
			"socket elsewhere", dir, mode.Perm())
	}
	return nil
}

// freeForSocket reports why the socket cannot be put at path, or nil: when
// nothing is there, or a socket that nobody listens on, which a sdash that
// was killed leaves behind and which the new socket then replaces.
//
// A socket that answers belongs to a running sdash, and taking its name
// would cut that one off from every forward. Anything that is not a socket
// was put there by someone for a reason, and is not sdash's to remove.
func freeForSocket(ctx context.Context, path string) error {
	info, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("look at the socket path: %w", err)
	}
	if info.Mode().Type() != fs.ModeSocket {
		return fmt.Errorf("%s exists and is not a socket; sdash does not remove it", path)
	}

	dialer := net.Dialer{Timeout: answerTimeout}
	conn, err := dialer.DialContext(ctx, "unix", path)
	if err == nil {
		// The connection was a question, and its answer is in.
		_ = conn.Close()
		return fmt.Errorf("another sdash is listening there: the socket %s answers; stop that sdash or name another socket", path)
	}
	if !errors.Is(err, syscall.ECONNREFUSED) {
		return fmt.Errorf("find out whether the socket %s is in use: %w", path, err)
	}
	return nil
}

// makeStagingDir creates a directory in dir that the user alone can enter,
// under a name that is not taken, and returns its path.
func makeStagingDir(dir string) (string, error) {
	var err error
	for range stagingTries {
		staging := filepath.Join(dir, stagingPrefix+rand.Text()[:stagingRandom])
		// Mkdir fails on a name that exists, a symbolic link included, so
		// the directory is one this call made.
		if err = os.Mkdir(staging, 0o700); err == nil {
			return staging, nil
		}
		if !errors.Is(err, fs.ErrExist) {
			break
		}
	}
	return "", fmt.Errorf("create a directory to bind the socket in: %w", err)
}

// socketListener is the listener on a unix socket. It takes the socket file
// with it when it closes, so that a later sdash, or a user who looks, finds
// a socket only where one is served.
type socketListener struct {
	net.Listener
	// path is where the socket lies.
	path string
	// created describes the socket file as it was bound.
	created fs.FileInfo
	// remove runs the removal once: the HTTP server closes a listener on
	// more than one of its ways out.
	remove sync.Once
}

// Close removes the socket file and closes the listener.
//
// The file is removed only while it is still the one this listener bound.
// When the user has removed it and started another sdash on the same path,
// the file there is that one's socket. The check is made before the
// listener closes, because until then the bound socket keeps its file
// alive, and no other file can be mistaken for it.
func (l *socketListener) Close() error {
	l.remove.Do(func() {
		if now, err := os.Lstat(l.path); err == nil && os.SameFile(l.created, now) {
			// A socket that stays behind answers nobody, and the next
			// sdash on this path replaces it.
			_ = os.Remove(l.path)
		}
	})
	return l.Listener.Close()
}

// Addr returns the path the socket lies at, and not the one it was bound
// under, which is what the system would report.
func (l *socketListener) Addr() net.Addr {
	return &net.UnixAddr{Name: l.path, Net: "unix"}
}
