// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/netip"
	"strconv"
	"syscall"
)

// CheckListen reports why addr cannot be the address of the listener, or
// nil. It takes host:port with a numeric port, where the host is localhost
// or a loopback IP address.
//
// Anything else is refused rather than bound: sdash serves the machine it
// runs on and nothing beyond it
// (doc/adr/0001-local-first-binary-with-embedded-ui.md), and an empty host
// or 0.0.0.0 would offer the user's Slurm identity to the network.
func CheckListen(addr string) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("%q is not host:port: %w", addr, err)
	}
	if _, err := strconv.ParseUint(port, 10, 16); err != nil {
		return fmt.Errorf("%q has no port number between 0 and 65535", addr)
	}
	if host == "localhost" {
		return nil
	}
	ip, err := netip.ParseAddr(host)
	if err != nil || !ip.IsLoopback() {
		return fmt.Errorf("%q is not a loopback address", addr)
	}
	return nil
}

// bindAddress returns the address to bind for addr, which CheckListen has
// accepted. The name localhost becomes the literal 127.0.0.1, so that no
// resolver is asked: the hosts file, or DNS with its search domains, could
// give the name another address, and sdash would then serve on it.
func bindAddress(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil || host != "localhost" {
		return addr
	}
	return net.JoinHostPort("127.0.0.1", port)
}

// loopbackAddr returns the address a listener is bound to, or an error when
// that is anything but a TCP port on a loopback address. CheckListen refuses
// every other address before it is bound; this holds what was bound to the
// same rule, whatever the system made of the request
// (doc/adr/0012-local-listener-security.md).
func loopbackAddr(bound net.Addr) (*net.TCPAddr, error) {
	addr, ok := bound.(*net.TCPAddr)
	if !ok {
		return nil, fmt.Errorf("the listener is bound to %s, which is not a TCP address", bound)
	}
	if !addr.IP.IsLoopback() {
		return nil, fmt.Errorf("the listener is bound to %s, which is not a loopback address", addr.IP)
	}
	return addr, nil
}

// listen binds addr. When another process holds it, listen binds a free
// port on the same host instead and logs which, so that a second sdash, or
// anything else on the default port, does not keep this one from starting.
// Any other failure is returned: a port that may not be bound is not made
// better by trying another.
func listen(ctx context.Context, addr string, logger *slog.Logger) (net.Listener, error) {
	var config net.ListenConfig
	listener, err := config.Listen(ctx, "tcp", addr)
	if err == nil {
		return listener, nil
	}
	if !errors.Is(err, syscall.EADDRINUSE) {
		return nil, fmt.Errorf("open the listener: %w", err)
	}

	// An address that was found in use has been parsed, so it splits.
	host, _, _ := net.SplitHostPort(addr)
	listener, err = config.Listen(ctx, "tcp", net.JoinHostPort(host, "0"))
	if err != nil {
		return nil, fmt.Errorf("open the listener on a free port: %w", err)
	}
	logger.Warn("address in use, listening on a free port instead",
		"wanted", addr, "address", listener.Addr().String())
	return listener, nil
}
