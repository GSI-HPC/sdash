// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"log/slog"
	"net"
	"strconv"

	"github.com/GSI-HPC/go-clikit/localweb"
)

// DefaultPort is the port sdash listens on unless it is told otherwise. A
// server on a unix socket has no port; its address names this one for the
// forward the user puts in front of the socket, so that the address is the
// one a user of a local sdash is used to.
const DefaultPort = "7374"

// bindFunc opens a listener, as net.ListenConfig.Listen does. A test stands
// in with one for a machine that the one it runs on is not: one without an
// IPv6 loopback address, or one on which a port is taken.
type bindFunc = func(ctx context.Context, network, address string) (net.Listener, error)

// listen binds addr, which localweb.CheckAddr has accepted, and says in the
// log what the user did not ask for. localweb does the binding and the
// checks of the socket and its directories
// (doc/adr/0026-go-clikit-localweb-for-the-listener-and-the-guard.md); the log is
// sdash's.
//
// A port that is taken gives way to a free one, so that a second sdash, or
// anything else on the port, does not keep this one from starting. Port 0
// asks for any port, and then no port was wanted that the user could miss.
// A host without an IPv6 loopback address is served on 127.0.0.1 alone, which
// is no warning: the address sdash prints names 127.0.0.1 and works. What is
// lost is the name localhost, which the server answers to only while it holds
// both addresses.
func listen(ctx context.Context, bind bindFunc, addr string, logger *slog.Logger) (*localweb.Bound, error) {
	bound, err := localweb.Listen(ctx, addr, localweb.ListenOptions{AnyPort: true, Bind: bind})
	if err != nil {
		return nil, err
	}
	if bound.Socket != "" {
		return bound, nil
	}
	// An address that localweb.Listen accepted splits.
	host, port, _ := net.SplitHostPort(addr)
	if got := bound.Addrs[0].Port(); port != "0" && port != strconv.Itoa(int(got)) {
		logger.Warn("address in use, listening on a free port instead",
			"wanted", addr, "address", bound.Listeners[0].Addr().String())
	}
	if host == "localhost" && len(bound.Addrs) == 1 {
		logger.Info("no IPv6 loopback address to bind, listening on 127.0.0.1 alone and not under the name localhost")
	}
	return bound, nil
}

// forwardHost returns the host and port of the address the user opens. On TCP
// that is the first address bound, which for the name localhost is 127.0.0.1.
// A unix socket has none, and DefaultPort on 127.0.0.1 stands for the forward
// in front of it.
func forwardHost(bound *localweb.Bound) string {
	if bound.Socket != "" {
		return net.JoinHostPort("127.0.0.1", DefaultPort)
	}
	return bound.Host()
}
