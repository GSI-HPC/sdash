// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"errors"
	"net"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/go-clikit/localweb"
)

// peerListener is a listener that peerRecorder has wrapped.
type peerListener struct {
	net.Listener
	uid int
}

// peerRecorder stands in for localweb.PeerListener: it wraps every listener
// it is given and remembers for which user, or fails with err.
type peerRecorder struct {
	err  error
	uids []int
}

func (p *peerRecorder) wrap(l net.Listener, uid int, _ func(error)) (net.Listener, error) {
	p.uids = append(p.uids, uid)
	if p.err != nil {
		return nil, p.err
	}
	return peerListener{Listener: l, uid: uid}, nil
}

func uidOf(id int) func() int { return func() int { return id } }

func twoListeners(t *testing.T) *localweb.Bound {
	t.Helper()
	loopback := newFakeLoopback()
	bound, err := listen(t.Context(), loopback.bind, "localhost:7374", discardLogger())
	require.NoError(t, err)
	require.Len(t, bound.Listeners, 2)
	return bound
}

// Every TCP listener is guarded, with the ID of the user it was given.
func TestEveryTCPListenerIsGuardedForTheUser(t *testing.T) {
	t.Parallel()

	bound := twoListeners(t)
	peer := &peerRecorder{}

	got, err := guardPeers(bound, uidOf(1000), peer.wrap, discardLogger())

	require.NoError(t, err)
	require.Len(t, got, 2)
	for _, l := range got {
		assert.Equal(t, 1000, l.(peerListener).uid)
	}
	assert.Equal(t, []int{1000, 1000}, peer.uids)
}

// Only the user can connect to a socket, and a server that was not told whose
// it is has nobody to keep out.
func TestASocketAndAServerWithoutAUserAreNotGuarded(t *testing.T) {
	t.Parallel()

	socket := &localweb.Bound{Listeners: []net.Listener{newPipeListener()}, Socket: "/run/user/1000/sdash/sdash.sock"}
	tcp := twoListeners(t)
	for name, tt := range map[string]struct {
		bound *localweb.Bound
		uid   func() int
	}{
		"a socket":            {bound: socket, uid: uidOf(1000)},
		"no user to look for": {bound: tcp, uid: nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			peer := &peerRecorder{}

			got, err := guardPeers(tt.bound, tt.uid, peer.wrap, discardLogger())

			require.NoError(t, err)
			assert.Equal(t, tt.bound.Listeners, got)
			assert.Empty(t, peer.uids)
		})
	}
}

// On a system that cannot tell whose a connection is, such as macOS, sdash
// still starts, as it did before it could tell anywhere: the user is told
// once that the port is open to the host, and of the way out.
func TestASystemThatCannotTellWhoseAConnectionIsServesTheListenersAsTheyAre(t *testing.T) {
	t.Parallel()

	bound := twoListeners(t)
	peer := &peerRecorder{err: errors.ErrUnsupported}
	log := &logBuffer{}

	got, err := guardPeers(bound, uidOf(1000), peer.wrap, log.logger())

	require.NoError(t, err)
	assert.Equal(t, bound.Listeners, got)
	assert.Equal(t, []int{1000}, peer.uids, "the first refusal is enough")
	assert.Contains(t, log.String(), "level=INFO")
	assert.Contains(t, log.String(), "unix socket")
}

// A listener that cannot be guarded for another reason is no listener to
// serve on: all are closed, since a half-guarded server answers to users it
// was meant to keep out.
func TestAListenerThatCannotBeGuardedEndsTheStart(t *testing.T) {
	t.Parallel()

	bound := twoListeners(t)
	peer := &peerRecorder{err: errors.New("no /proc")}

	got, err := guardPeers(bound, uidOf(1000), peer.wrap, discardLogger())

	require.ErrorContains(t, err, "guard the listener")
	require.ErrorContains(t, err, "no /proc")
	assert.Nil(t, got)
	for _, l := range bound.Listeners {
		_, accept := l.Accept()
		assert.ErrorIs(t, accept, net.ErrClosed)
	}
}
