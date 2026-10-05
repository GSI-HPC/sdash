// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"maps"
	"net"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sdash acts as the user who started it. An address that other machines can
// reach would offer that identity to the network, so it is refused before
// anything is bound.
func TestOnlyALoopbackAddressOrASocketMayBeListenedOn(t *testing.T) {
	t.Parallel()

	tests := []struct {
		addr string
		ok   bool
	}{
		{addr: "127.0.0.1:7374", ok: true},
		{addr: "127.0.0.1:0", ok: true},
		{addr: "localhost:7374", ok: true},
		{addr: "[::1]:7374", ok: true},
		{addr: "127.0.0.2:65535", ok: true},
		{addr: "unix:/run/user/1000/sdash/sdash.sock", ok: true},
		{addr: "unix:/s", ok: true},

		{addr: "0.0.0.0:7374"},
		{addr: "[::]:7374"},
		// An empty host binds every interface.
		{addr: ":7374"},
		{addr: "192.0.2.10:7374"},
		{addr: "example.org:7374"},
		// A name that resolves to loopback today may resolve elsewhere
		// tomorrow; only the one fixed name is taken.
		{addr: "localhost.localdomain:7374"},
		{addr: "127.0.0.1"},
		{addr: "127.0.0.1:"},
		{addr: "127.0.0.1:http"},
		{addr: "127.0.0.1:65536"},
		{addr: "127.0.0.1:-1"},
		{addr: ""},
		// The command line fills in the default socket and makes a path
		// absolute (internal/cli); what arrives here is taken as it is.
		{addr: "unix:"},
		{addr: "unix:sdash.sock"},
		{addr: "unix:./sdash.sock"},
		// Only the one scheme, in the one spelling.
		{addr: "UNIX:/run/user/1000/sdash/sdash.sock"},
		{addr: "unix///run/user/1000/sdash/sdash.sock"},
		{addr: "tcp:127.0.0.1:7374"},
	}
	for _, tt := range tests {
		t.Run(tt.addr, func(t *testing.T) {
			t.Parallel()

			err := CheckListen(tt.addr)

			if tt.ok {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

// What was asked for is checked before it is bound. What was bound is
// checked again, since it is the address sdash serves the user's Slurm
// identity on, and the Host allow-list follows it.
func TestAListenerBoundOutsideLoopbackIsRefused(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		bound net.Addr
		want  string
	}{
		{name: "the IPv4 loopback address", bound: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 7374}},
		{name: "another address of the loopback network", bound: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 2), Port: 7374}},
		{name: "the IPv6 loopback address", bound: &net.TCPAddr{IP: net.IPv6loopback, Port: 7374}},
		{
			name:  "an address of a network interface",
			bound: &net.TCPAddr{IP: net.IPv4(192, 0, 2, 10), Port: 7374},
			want:  "the listener is bound to 192.0.2.10, which is not a loopback address",
		},
		{
			name:  "every interface",
			bound: &net.TCPAddr{IP: net.IPv4zero, Port: 7374},
			want:  "the listener is bound to 0.0.0.0, which is not a loopback address",
		},
		{
			name:  "every interface over IPv6",
			bound: &net.TCPAddr{IP: net.IPv6unspecified, Port: 7374},
			want:  "the listener is bound to ::, which is not a loopback address",
		},
		{
			// A host and a port were asked for, so a socket is not what
			// may come back.
			name:  "a unix socket",
			bound: &net.UnixAddr{Name: "/run/user/1000/sdash.sock", Net: "unix"},
			want:  "the listener is bound to /run/user/1000/sdash.sock, which is not a TCP address",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			addr, err := loopbackAddr(tt.bound)

			if tt.want != "" {
				require.EqualError(t, err, tt.want)
				assert.Nil(t, addr)
				return
			}
			require.NoError(t, err)
			assert.Same(t, tt.bound, addr)
		})
	}
}

// An address that is not loopback's has to be refused after the bind as
// before it, and then nothing may stay bound.
func TestWhatWasBoundOutsideLoopbackIsClosedAgain(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	elsewhere := func(ctx context.Context, network, address string) (net.Listener, error) {
		listener, err := loopback.bind(ctx, network, address)
		if err != nil {
			return nil, err
		}
		// A system that hands back another address than the one asked for.
		return &movedListener{Listener: listener, addr: &net.TCPAddr{IP: net.IPv4(192, 0, 2, 10), Port: 7374}}, nil
	}

	opened, err := open(t.Context(), elsewhere, "localhost:7374", discardLogger())

	require.ErrorContains(t, err, "not a loopback address")
	assert.Nil(t, opened)
	assert.Empty(t, loopback.held(), "nothing stays bound")
}

// movedListener reports another address than the one it is bound to.
type movedListener struct {
	net.Listener
	addr net.Addr
}

func (l *movedListener) Addr() net.Addr { return l.addr }

func TestAFreeAddressIsBoundAsAsked(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}

	listeners, err := listenLiteral(t.Context(), systemBind, "127.0.0.1:0", log.logger())
	require.NoError(t, err)
	t.Cleanup(func() { closeAll(listeners) })

	require.Len(t, listeners, 1, "a literal address is one address")
	assert.True(t, listeners[0].Addr().(*net.TCPAddr).IP.IsLoopback())
	assert.Empty(t, log.String())
}

// A second sdash, or anything else on the default port, must not keep this
// one from starting. The user is told, since the address is then not the
// one a bookmark or a habit expects.
func TestABusyAddressFallsBackToAFreePortAndSaysSo(t *testing.T) {
	t.Parallel()

	holder, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = holder.Close() })
	busy := holder.Addr().String()
	log := &logBuffer{}

	listeners, err := listenLiteral(t.Context(), systemBind, busy, log.logger())
	require.NoError(t, err)
	t.Cleanup(func() { closeAll(listeners) })

	require.Len(t, listeners, 1)
	got := listeners[0].Addr().(*net.TCPAddr)
	assert.True(t, got.IP.Equal(net.IPv4(127, 0, 0, 1)), "the fallback stays on the host that was asked for")
	assert.NotEqual(t, holder.Addr().(*net.TCPAddr).Port, got.Port)
	assert.Contains(t, log.String(), "level=WARN")
	assert.Contains(t, log.String(), "wanted="+busy)
	assert.Contains(t, log.String(), "address="+got.String())
}

// Only a port that is taken is worth another try. An address this machine
// does not have is a mistake that another port would hide.
func TestAnAddressThatCannotBeBoundIsAnError(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}

	// 192.0.2.0/24 is reserved for documentation; no interface carries it.
	listeners, err := listenLiteral(t.Context(), systemBind, "192.0.2.10:0", log.logger())
	closeAll(listeners)

	require.ErrorContains(t, err, "open the listener")
	assert.Empty(t, log.String())
}

// A literal address is one address: whoever names 127.0.0.1 or ::1 gets
// that listener and no second one beside it.
func TestALiteralAddressBindsThatAddressAlone(t *testing.T) {
	t.Parallel()

	for _, addr := range []string{"127.0.0.1:7374", "[::1]:7374", "127.0.0.2:7374"} {
		t.Run(addr, func(t *testing.T) {
			t.Parallel()

			loopback := newFakeLoopback()

			opened, err := open(t.Context(), loopback.bind, addr, discardLogger())

			require.NoError(t, err)
			assert.Equal(t, []string{addr}, loopback.asked())
			require.Len(t, opened.addrs, 1)
			assert.Equal(t, addr, opened.addrs[0].String())
			assert.Equal(t, addr, opened.host())
			assert.Empty(t, opened.socket)
		})
	}
}

// The release binary resolves names itself, from the hosts file and then
// from DNS with its search domains. Either could give localhost an address
// of a network interface, so the name is never looked up: it stands for the
// two literal loopback addresses, and those are what is bound.
func TestLocalhostIsBoundAsTheTwoLiteralLoopbackAddresses(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	log := &logBuffer{}

	opened, err := open(t.Context(), loopback.bind, "localhost:7374", log.logger())

	require.NoError(t, err)
	assert.Equal(t, []string{"127.0.0.1:7374", "[::1]:7374"}, loopback.asked())
	require.Len(t, opened.listeners, 2)
	require.Len(t, opened.addrs, 2)
	assert.Equal(t, "127.0.0.1:7374", opened.addrs[0].String())
	assert.Equal(t, "[::1]:7374", opened.addrs[1].String())
	// The address the user is given keeps the literal form.
	assert.Equal(t, "127.0.0.1:7374", opened.host())
	assert.Empty(t, log.String(), "nothing needs saying when both addresses are bound as asked")
}

// The server answers to the name localhost only while it holds one port on
// both addresses, so for port 0 the second address takes the number the
// system chose for the first.
func TestAnyPortOfLocalhostIsTheSameNumberOnBothAddresses(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	loopback.offer(41233)
	log := &logBuffer{}

	listeners, err := listenLocalhost(t.Context(), loopback.bind, "0", log.logger())

	require.NoError(t, err)
	require.Len(t, listeners, 2)
	assert.Equal(t, []string{"127.0.0.1:0", "[::1]:41233"}, loopback.asked())
	assert.Equal(t, []string{"127.0.0.1:41233", "[::1]:41233"}, loopback.held())
	assert.Empty(t, log.String())
}

// A port that is taken on either address is no port for localhost. Half of
// it is not kept: the listener that was bound is given up, and a port that
// is free on both is bound in its place. The user is told, since the
// address is then not the one that was asked for.
func TestAPortThatIsBusyOnEitherLoopbackAddressFallsBackToOneFreeOnBoth(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		busy []string
		// offered are the ports the system hands out for port 0, in turn.
		offered []int
		want    []string
	}{
		{
			name:    "busy on 127.0.0.1",
			busy:    []string{"127.0.0.1:7374"},
			offered: []int{41233},
			want:    []string{"127.0.0.1:41233", "[::1]:41233"},
		},
		{
			name:    "busy on ::1",
			busy:    []string{"[::1]:7374"},
			offered: []int{41233},
			want:    []string{"127.0.0.1:41233", "[::1]:41233"},
		},
		{
			name:    "busy on both",
			busy:    []string{"127.0.0.1:7374", "[::1]:7374"},
			offered: []int{41233},
			want:    []string{"127.0.0.1:41233", "[::1]:41233"},
		},
		{
			// The system offers a port that is free on 127.0.0.1. Whether
			// it is free on ::1 only the second bind tells.
			name:    "the port the system offers is busy on ::1 as well",
			busy:    []string{"127.0.0.1:7374", "[::1]:41233", "[::1]:41234"},
			offered: []int{41233, 41234, 41235},
			want:    []string{"127.0.0.1:41235", "[::1]:41235"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			loopback := newFakeLoopback()
			loopback.occupy(tt.busy...)
			loopback.offer(tt.offered...)
			log := &logBuffer{}

			listeners, err := listenLocalhost(t.Context(), loopback.bind, "7374", log.logger())

			require.NoError(t, err)
			require.Len(t, listeners, 2)
			assert.Equal(t, tt.want, loopback.held(), "one port on both addresses, and nothing else kept")
			assert.Equal(t, 1, strings.Count(log.String(), "level=WARN"), log.String())
			assert.Contains(t, log.String(), "wanted=localhost:7374")
			assert.Contains(t, log.String(), "address="+tt.want[0])
		})
	}
}

// Port 0 asks for any port. When the first one the system offers is taken
// on ::1, another is tried, and there is no port the user wanted and has to
// be told about.
func TestAnyPortOfLocalhostIsTriedAgainWithoutAWarning(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	loopback.occupy("[::1]:41233")
	loopback.offer(41233, 41234)
	log := &logBuffer{}

	listeners, err := listenLocalhost(t.Context(), loopback.bind, "0", log.logger())

	require.NoError(t, err)
	require.Len(t, listeners, 2)
	assert.Equal(t, []string{"127.0.0.1:41234", "[::1]:41234"}, loopback.held())
	assert.Empty(t, log.String())
}

// The search for a port that is free on both addresses ends. A machine on
// which it never succeeds has something wrong with it that an error shows
// and a loop would hide.
func TestTheSearchForAPortFreeOnBothAddressesIsBounded(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	loopback.occupy("127.0.0.1:7374")
	for port := 40000; port < 40100; port++ {
		loopback.occupy("[::1]:" + strconv.Itoa(port))
		loopback.offer(port)
	}

	listeners, err := listenLocalhost(t.Context(), loopback.bind, "7374", discardLogger())

	require.ErrorContains(t, err, "no port was free on both loopback addresses in 16 tries")
	require.ErrorIs(t, err, syscall.EADDRINUSE)
	assert.Empty(t, listeners)
	// The first try with the port that was asked for, and the bounded
	// number with ports of the system's choice, each of which got as far
	// as ::1.
	assert.Len(t, loopback.asked(), 1+2*portTries)
	assert.Empty(t, loopback.held(), "nothing stays bound")
}

// A host can be without an IPv6 loopback address: the kernel has no IPv6, or
// it is switched off for the interface, as on many a cluster node and in
// many a container. sdash still has to start there. It serves 127.0.0.1
// alone and says so once, and not as a warning: the address it prints works.
func TestAHostWithoutIPv6LoopbackIsServedOnIPv4AloneAndToldOnce(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  syscall.Errno
		// call names the system call the error comes from.
		call string
	}{
		// IPv6 is switched off for the loopback interface.
		{name: "the address is not there", err: syscall.EADDRNOTAVAIL, call: "bind"},
		// The kernel knows no IPv6 at all.
		{name: "the address family is not there", err: syscall.EAFNOSUPPORT, call: "socket"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			loopback := newFakeLoopback()
			loopback.withoutIPv6(tt.call, tt.err)
			log := &logBuffer{}

			opened, err := open(t.Context(), loopback.bind, "localhost:7374", log.logger())

			require.NoError(t, err)
			require.Len(t, opened.listeners, 1)
			require.Len(t, opened.addrs, 1)
			assert.Equal(t, "127.0.0.1:7374", opened.addrs[0].String())
			assert.Equal(t, "127.0.0.1:7374", opened.host())
			assert.Equal(t, []string{"127.0.0.1:7374"}, loopback.held())
			assert.Equal(t, 1, strings.Count(log.String(), "no IPv6 loopback address to bind"), log.String())
			assert.Contains(t, log.String(), "level=INFO")
			assert.NotContains(t, log.String(), "level=WARN")
			// With one address held, the name localhost is not answered.
			assert.NotContains(t, allowedHosts(opened.addrs), "localhost:7374")
		})
	}
}

// Both things at once: the port is taken and the host has no IPv6 loopback
// address. The fallback port is then one on 127.0.0.1 alone, and each fact
// is said once.
func TestABusyPortOnAHostWithoutIPv6LoopbackFallsBackOnIPv4Alone(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	loopback.withoutIPv6("bind", syscall.EADDRNOTAVAIL)
	loopback.occupy("127.0.0.1:7374")
	loopback.offer(41233)
	log := &logBuffer{}

	listeners, err := listenLocalhost(t.Context(), loopback.bind, "7374", log.logger())

	require.NoError(t, err)
	require.Len(t, listeners, 1)
	assert.Equal(t, "127.0.0.1:41233", listeners[0].Addr().String())
	assert.Equal(t, 1, strings.Count(log.String(), "no IPv6 loopback address to bind"), log.String())
	assert.Equal(t, 1, strings.Count(log.String(), "address in use, listening on a free port instead"), log.String())
	assert.Contains(t, log.String(), "wanted=localhost:7374 address=127.0.0.1:41233")
}

// Only a missing address is a reason to serve one address alone, and only a
// busy port a reason to try another. Anything else that keeps an address
// from being bound is reported, and the address that was bound is given up
// with it.
func TestALoopbackAddressThatMayNotBeBoundIsAnError(t *testing.T) {
	t.Parallel()

	t.Run("::1", func(t *testing.T) {
		t.Parallel()

		loopback := newFakeLoopback()
		loopback.withoutIPv6("bind", syscall.EACCES)
		log := &logBuffer{}

		listeners, err := listenLocalhost(t.Context(), loopback.bind, "7374", log.logger())

		require.ErrorContains(t, err, "open the listener")
		require.ErrorIs(t, err, syscall.EACCES)
		assert.Empty(t, listeners)
		assert.Empty(t, loopback.held(), "the listener on 127.0.0.1 is closed again")
		assert.Empty(t, log.String())
	})

	t.Run("127.0.0.1", func(t *testing.T) {
		t.Parallel()

		refused := func(context.Context, string, string) (net.Listener, error) {
			return nil, &net.OpError{Op: "listen", Net: "tcp", Err: os.NewSyscallError("bind", syscall.EACCES)}
		}

		listeners, err := listenLocalhost(t.Context(), refused, "80", discardLogger())

		require.ErrorContains(t, err, "open the listener")
		require.ErrorIs(t, err, syscall.EACCES)
		assert.Empty(t, listeners)
	})
}

// fakeLoopback stands in for the loopback interface of a machine: it knows
// which addresses are taken and which ports the system would hand out, and
// binds nothing real. With it a test decides what the machine is like, in
// place of depending on the one it runs on.
type fakeLoopback struct {
	mu sync.Mutex
	// others holds the addresses another process is bound to, as host:port,
	// and ours the ones the code under test has bound.
	others, ours map[string]bool
	// offered are the ports handed out for port 0, in turn.
	offered []int
	// noIPv6 is what every bind on ::1 fails with, when set.
	noIPv6 error
	// binds are the addresses that were asked for, in order.
	binds []string
}

func newFakeLoopback() *fakeLoopback {
	return &fakeLoopback{others: map[string]bool{}, ours: map[string]bool{}}
}

// occupy marks addresses as held by another process.
func (f *fakeLoopback) occupy(addresses ...string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, address := range addresses {
		f.others[address] = true
	}
}

// offer adds to the ports the system hands out for port 0, in turn.
func (f *fakeLoopback) offer(ports ...int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.offered = append(f.offered, ports...)
}

// withoutIPv6 makes every bind on ::1 fail with errno, reported as the
// system reports a failure of call.
func (f *fakeLoopback) withoutIPv6(call string, errno syscall.Errno) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.noIPv6 = os.NewSyscallError(call, errno)
}

// asked returns the addresses that were asked for, in order.
func (f *fakeLoopback) asked() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.binds)
}

// held returns the addresses the code under test holds, those of 127.0.0.1
// before those of ::1.
func (f *fakeLoopback) held() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	// A digit sorts before a bracket.
	return slices.Sorted(maps.Keys(f.ours))
}

// bind is the bindFunc of the fake.
func (f *fakeLoopback) bind(_ context.Context, network, address string) (net.Listener, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.binds = append(f.binds, address)

	fail := func(err error) (net.Listener, error) {
		return nil, &net.OpError{Op: "listen", Net: network, Err: err}
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return fail(err)
	}
	if host == "::1" && f.noIPv6 != nil {
		return fail(f.noIPv6)
	}
	if port == "0" {
		if len(f.offered) == 0 {
			return fail(os.NewSyscallError("bind", syscall.EADDRINUSE))
		}
		port = strconv.Itoa(f.offered[0])
		f.offered = f.offered[1:]
	}
	bound := net.JoinHostPort(host, port)
	if f.others[bound] || f.ours[bound] {
		return fail(os.NewSyscallError("bind", syscall.EADDRINUSE))
	}
	f.ours[bound] = true
	number, err := strconv.Atoi(port)
	if err != nil {
		return fail(err)
	}
	return &fakeListener{loopback: f, addr: &net.TCPAddr{IP: net.ParseIP(host), Port: number}}, nil
}

// fakeListener is an address held on a fakeLoopback. Nothing connects to
// it; closing it frees the address.
type fakeListener struct {
	loopback *fakeLoopback
	addr     *net.TCPAddr
}

func (l *fakeListener) Accept() (net.Conn, error) { return nil, net.ErrClosed }

func (l *fakeListener) Addr() net.Addr { return l.addr }

func (l *fakeListener) Close() error {
	l.loopback.mu.Lock()
	defer l.loopback.mu.Unlock()
	delete(l.loopback.ours, l.addr.String())
	return nil
}
