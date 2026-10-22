// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"errors"
	"fmt"
	"log/slog"
	"net"

	"github.com/GSI-HPC/go-clikit/localweb"
)

// peerFunc is the type of localweb.PeerListener. guardPeers takes it so that
// a test can stand in for a system on which the owner of a connection cannot
// be told.
type peerFunc = func(l net.Listener, uid int, refused func(error)) (net.Listener, error)

// guardPeers makes the TCP listeners of a server accept only the connections
// that a process of the user opened. Other users of a host can connect to a
// loopback port, and the first thing a connection of theirs would meet is the
// Host check, which only a client that is no browser has to pass; closing the
// connection before a request is read leaves them nothing to try
// (doc/adr/0026-go-clikit-localweb-for-the-listener-and-the-guard.md).
//
// A listener on a unix socket needs no such guard: only the user can connect
// to it. Where the system cannot tell whose a connection is, the listeners
// are served as they are and the log says so, as it has been the rule that
// "a loopback port is open to every process on the host"
// (doc/adr/0012-local-listener-security.md) on such a system; the way out is
// the unix socket. Any other failure ends the start, with the listeners
// closed.
func guardPeers(bound *localweb.Bound, uid func() int, peer peerFunc, logger *slog.Logger) ([]net.Listener, error) {
	if bound.Socket != "" || uid == nil {
		return bound.Listeners, nil
	}
	refused := func(err error) { logger.Warn("closed a connection", "error", err) }
	guarded := make([]net.Listener, 0, len(bound.Listeners))
	for _, l := range bound.Listeners {
		g, err := peer(l, uid(), refused)
		switch {
		case err == nil:
			guarded = append(guarded, g)
		case errors.Is(err, errors.ErrUnsupported):
			logger.Info("cannot tell whose a connection is on this system, so every user of this host can connect "+
				"to the port; listen on a unix socket to keep them out", "error", err)
			return bound.Listeners, nil
		default:
			_ = bound.Close()
			return nil, fmt.Errorf("guard the listener: %w", err)
		}
	}
	return guarded, nil
}
