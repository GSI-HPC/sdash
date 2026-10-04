// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"net"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sdash acts as the user who started it. An address that other machines can
// reach would offer that identity to the network, so it is refused before
// anything is bound.
func TestOnlyALoopbackAddressMayBeListenedOn(t *testing.T) {
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

// The release binary resolves names itself, from the hosts file and then
// from DNS with its search domains. Either could give localhost an address
// of a network interface, so the name is never looked up.
func TestLocalhostIsBoundAsTheLiteralLoopbackAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		addr string
		want string
	}{
		{addr: "localhost:7374", want: "127.0.0.1:7374"},
		{addr: "localhost:0", want: "127.0.0.1:0"},
		{addr: "127.0.0.1:7374", want: "127.0.0.1:7374"},
		{addr: "127.0.0.2:7374", want: "127.0.0.2:7374"},
		{addr: "[::1]:7374", want: "[::1]:7374"},
	}
	for _, tt := range tests {
		t.Run(tt.addr, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, bindAddress(tt.addr))
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

func TestAFreeAddressIsBoundAsAsked(t *testing.T) {
	t.Parallel()

	log := &logBuffer{}

	listener, err := listen(t.Context(), "127.0.0.1:0", log.logger())
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	assert.True(t, listener.Addr().(*net.TCPAddr).IP.IsLoopback())
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

	listener, err := listen(t.Context(), busy, log.logger())
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	got := listener.Addr().(*net.TCPAddr)
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
	listener, err := listen(t.Context(), "192.0.2.10:0", log.logger())
	if listener != nil {
		_ = listener.Close()
	}

	require.ErrorContains(t, err, "open the listener")
	assert.Empty(t, log.String())
}
