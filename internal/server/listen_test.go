// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"net"
	"os"
	"strconv"
	"sync"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/go-clikit/localweb"
)

// What binds, and the rules a listener has to keep, are localweb's
// (Listen); these tests hold what sdash adds to it: what it says in its
// log, and the address it hands the user.

func TestAFreeAddressIsBoundAsAskedAndNothingIsSaid(t *testing.T) {
	t.Parallel()

	for _, addr := range []string{"127.0.0.1:7374", "[::1]:7374", "localhost:7374", "localhost:0"} {
		t.Run(addr, func(t *testing.T) {
			t.Parallel()

			loopback := newFakeLoopback()
			loopback.offer(41233)
			log := &logBuffer{}

			bound, err := listen(t.Context(), loopback.bind, addr, log.logger())

			require.NoError(t, err)
			assert.NotEmpty(t, bound.Listeners)
			assert.Empty(t, log.String())
		})
	}
}

func TestABusyAddressFallsBackToAFreePortAndSaysSo(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		addr string
		busy []string
	}{
		{name: "a literal address", addr: "127.0.0.1:7374", busy: []string{"127.0.0.1:7374"}},
		{name: "localhost, busy on 127.0.0.1", addr: "localhost:7374", busy: []string{"127.0.0.1:7374"}},
		{name: "localhost, busy on ::1 alone", addr: "localhost:7374", busy: []string{"[::1]:7374"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			loopback := newFakeLoopback()
			loopback.occupy(tt.busy...)
			loopback.offer(41233, 41233)
			log := &logBuffer{}

			bound, err := listen(t.Context(), loopback.bind, tt.addr, log.logger())

			require.NoError(t, err)
			assert.Equal(t, uint16(41233), bound.Addrs[0].Port())
			assert.Contains(t, log.String(), "level=WARN")
			assert.Contains(t, log.String(), "address in use, listening on a free port instead")
			assert.Contains(t, log.String(), "wanted="+tt.addr)
			assert.Contains(t, log.String(), "address=127.0.0.1:41233")
		})
	}
}

// A host without an IPv6 loopback address is common on cluster nodes and in
// containers, and sdash starts there. The address it prints works, so this
// is told as information and not as a warning.
func TestAHostWithoutIPv6LoopbackIsToldAsInformation(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	loopback.withoutIPv6("bind", syscall.EADDRNOTAVAIL)
	log := &logBuffer{}

	bound, err := listen(t.Context(), loopback.bind, "localhost:7374", log.logger())

	require.NoError(t, err)
	require.Len(t, bound.Addrs, 1)
	assert.Contains(t, log.String(), "level=INFO")
	assert.Contains(t, log.String(), "no IPv6 loopback address")
	assert.NotContains(t, log.String(), "WARN")
}

// A literal address asks for that address alone, so the missing IPv6
// loopback address of the host has nothing to report there.
func TestALiteralAddressNeverReportsAMissingIPv6Address(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	log := &logBuffer{}

	_, err := listen(t.Context(), loopback.bind, "127.0.0.1:7374", log.logger())

	require.NoError(t, err)
	assert.Empty(t, log.String())
}

func TestAnAddressThatCannotBeBoundIsAnError(t *testing.T) {
	t.Parallel()

	refused := func(context.Context, string, string) (net.Listener, error) {
		return nil, &net.OpError{Op: "listen", Net: "tcp", Err: os.NewSyscallError("bind", syscall.EACCES)}
	}

	bound, err := listen(t.Context(), refused, "localhost:80", discardLogger())

	require.ErrorIs(t, err, syscall.EACCES)
	assert.Nil(t, bound)
}

// The user opens 127.0.0.1 whatever the name asked for, because that is the
// address that leads to the server whatever a resolver makes of localhost.
// Behind a socket the forward starts from the suggested port.
func TestTheAddressTheUserOpensIsTheLiteralOne(t *testing.T) {
	t.Parallel()

	loopback := newFakeLoopback()
	bound, err := listen(t.Context(), loopback.bind, "localhost:7374", discardLogger())
	require.NoError(t, err)

	assert.Equal(t, "127.0.0.1:7374", forwardHost(bound))
	assert.Equal(t, "127.0.0.1:"+DefaultPort, forwardHost(&localweb.Bound{Socket: "/run/user/1000/sdash/sdash.sock"}))
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
