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
	"strings"
	"syscall"
)

const (
	// UnixScheme begins a listen address that names a unix socket by its
	// path, in place of a host and a port.
	UnixScheme = "unix:"
	// DefaultPort is the port sdash listens on unless it is told otherwise.
	// A server on a unix socket has no port; its address names this one for
	// the forward the user puts in front of the socket, so that the address
	// is the one a user of a local sdash is used to.
	DefaultPort = "7374"

	// portTries bounds the search for a port that is free on both loopback
	// addresses. The system hands out a port that is free on 127.0.0.1, and
	// only another listener on that very number on ::1 makes a try fail, so
	// a second try is rare and this many are never needed; the bound is
	// there so that a machine on which something is badly wrong gets an
	// error and not a loop.
	portTries = 16
)

// CheckListen reports why addr cannot be the address of the listener, or
// nil. It takes host:port with a numeric port, where the host is localhost
// or a loopback IP address, or unix: followed by the absolute path of a
// socket that fits a socket address.
//
// Anything else is refused rather than bound: sdash serves the machine it
// runs on and nothing beyond it
// (doc/adr/0001-local-first-binary-with-embedded-ui.md), and an empty host
// or 0.0.0.0 would offer the user's Slurm identity to the network.
func CheckListen(addr string) error {
	if path, ok := strings.CutPrefix(addr, UnixScheme); ok {
		return checkSocketPath(path)
	}
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

// bindFunc opens a listener, as net.ListenConfig.Listen does. Everything
// that binds takes one, so that a test can stand in for a machine that the
// one it runs on is not: one without an IPv6 loopback address, or one on
// which a port is taken.
type bindFunc func(ctx context.Context, network, address string) (net.Listener, error)

// systemBind binds on the machine sdash runs on.
func systemBind(ctx context.Context, network, address string) (net.Listener, error) {
	var config net.ListenConfig
	return config.Listen(ctx, network, address)
}

// bound is what a server listens on once New has opened it.
type bound struct {
	// listeners are served by one handler. There are two when the name
	// localhost was asked for and both loopback addresses could be bound,
	// and one otherwise.
	listeners []net.Listener
	// addrs are the TCP addresses of the listeners, in their order. A
	// listener on a unix socket has none.
	addrs []*net.TCPAddr
	// socket is the path of the unix socket, or "" for TCP.
	socket string
}

// host returns the host and port of the address the user opens. On TCP that
// is the first address bound, which for the name localhost is 127.0.0.1. A
// unix socket has none, and DefaultPort on 127.0.0.1 stands for the forward
// in front of it.
func (b *bound) host() string {
	if b.socket != "" {
		return net.JoinHostPort("127.0.0.1", DefaultPort)
	}
	return b.addrs[0].String()
}

// open binds addr, which CheckListen has accepted: the socket of a unix
// address, both loopback addresses for the name localhost, and the one
// address of a literal.
func open(ctx context.Context, bind bindFunc, addr string, logger *slog.Logger) (*bound, error) {
	if path, ok := strings.CutPrefix(addr, UnixScheme); ok {
		listener, err := listenSocket(ctx, bind, cleanSocketPath(path))
		if err != nil {
			return nil, err
		}
		// Where the socket lies, which is not the path as it was given
		// when a symbolic link leads to its directory.
		return &bound{listeners: []net.Listener{listener}, socket: listener.path}, nil
	}

	// An address CheckListen accepted splits.
	host, port, _ := net.SplitHostPort(addr)
	var listeners []net.Listener
	var err error
	if host == "localhost" {
		listeners, err = listenLocalhost(ctx, bind, port, logger)
	} else {
		listeners, err = listenLiteral(ctx, bind, addr, logger)
	}
	if err != nil {
		return nil, err
	}

	opened := &bound{listeners: listeners}
	for _, listener := range listeners {
		tcp, err := loopbackAddr(listener.Addr())
		if err != nil {
			// The addresses were bound a moment ago; closing them frees
			// the port and has nothing else to report.
			closeAll(listeners)
			return nil, err
		}
		opened.addrs = append(opened.addrs, tcp)
	}
	return opened, nil
}

// closeAll closes listeners that are not going to be served.
func closeAll(listeners []net.Listener) {
	for _, listener := range listeners {
		// Nothing was accepted on them, so there is nothing to lose and
		// nobody to tell.
		_ = listener.Close()
	}
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

// listenLiteral binds addr, a loopback IP address with a port, and nothing
// beside it. When another process holds it, a free port on the same address
// is bound instead and logged, so that a second sdash, or anything else on
// the port, does not keep this one from starting. Any other failure is
// returned: a port that may not be bound is not made better by trying
// another.
func listenLiteral(ctx context.Context, bind bindFunc, addr string, logger *slog.Logger) ([]net.Listener, error) {
	listener, err := bind(ctx, "tcp", addr)
	if err == nil {
		return []net.Listener{listener}, nil
	}
	if !errors.Is(err, syscall.EADDRINUSE) {
		return nil, fmt.Errorf("open the listener: %w", err)
	}

	// An address that was found in use has been parsed, so it splits.
	host, _, _ := net.SplitHostPort(addr)
	listener, err = bind(ctx, "tcp", net.JoinHostPort(host, "0"))
	if err != nil {
		return nil, fmt.Errorf("open the listener on a free port: %w", err)
	}
	logger.Warn("address in use, listening on a free port instead",
		"wanted", addr, "address", listener.Addr().String())
	return []net.Listener{listener}, nil
}

// listenLocalhost binds port on both loopback addresses, 127.0.0.1 and ::1,
// which is what the name localhost stands for. The two literals are bound
// and no resolver is asked: the hosts file, or DNS with its search domains,
// could give the name another address, and sdash would then serve on it.
//
// Both are bound on one port number, because that is what lets the server
// answer to the name: a browser asked for localhost tries ::1 before
// 127.0.0.1, and a port sdash holds on one address only can be held by
// another user's process on the other (allowedHosts). When the port is taken
// on either address, a port that is free on both is bound instead and
// logged.
//
// A host without an IPv6 loopback address is served on 127.0.0.1 alone.
func listenLocalhost(ctx context.Context, bind bindFunc, port string, logger *slog.Logger) ([]net.Listener, error) {
	listeners, err := bindLoopback(ctx, bind, port, logger)
	if err == nil {
		return listeners, nil
	}
	if !errors.Is(err, syscall.EADDRINUSE) {
		return nil, fmt.Errorf("open the listener: %w", err)
	}

	for range portTries {
		listeners, err = bindLoopback(ctx, bind, "0", logger)
		if err == nil {
			// Port 0 asks for any port, and then no port was wanted that
			// the user could miss.
			if port != "0" {
				logger.Warn("address in use, listening on a free port instead",
					"wanted", net.JoinHostPort("localhost", port), "address", listeners[0].Addr().String())
			}
			return listeners, nil
		}
		if !errors.Is(err, syscall.EADDRINUSE) {
			return nil, fmt.Errorf("open the listener on a free port: %w", err)
		}
	}
	return nil, fmt.Errorf("open the listener: no port was free on both loopback addresses in %d tries: %w", portTries, err)
}

// bindLoopback binds port on 127.0.0.1 and then the same number on ::1; for
// port 0 that is the number the system chose for the first. It returns both
// listeners, or the first alone when the host has no IPv6 loopback address
// to bind. When the second address cannot be had for any other reason, a
// port in use among them, the first is given up as well and the error
// returned: half of localhost on a port is not what was asked for.
func bindLoopback(ctx context.Context, bind bindFunc, port string, logger *slog.Logger) ([]net.Listener, error) {
	v4, err := bind(ctx, "tcp", net.JoinHostPort("127.0.0.1", port))
	if err != nil {
		return nil, err
	}
	// The address of a listener that was just bound splits.
	_, number, _ := net.SplitHostPort(v4.Addr().String())

	v6, err := bind(ctx, "tcp", net.JoinHostPort("::1", number))
	switch {
	case err == nil:
		return []net.Listener{v4, v6}, nil
	case noSuchAddress(err):
		// Not a warning: the address sdash prints names 127.0.0.1 and
		// works. What is lost is the name localhost, which the server
		// answers to only while it holds both addresses.
		logger.Info("no IPv6 loopback address to bind, listening on 127.0.0.1 alone and not under the name localhost",
			"error", err)
		return []net.Listener{v4}, nil
	default:
		// As in closeAll: nothing was accepted on it.
		_ = v4.Close()
		return nil, err
	}
}

// noSuchAddress reports whether a bind failed because the host does not
// have the address at all: IPv6 is switched off for the loopback interface,
// or the kernel was built or booted without it. A port that is in use is
// not this, and neither is one that may not be bound.
func noSuchAddress(err error) bool {
	return errors.Is(err, syscall.EADDRNOTAVAIL) || errors.Is(err, syscall.EAFNOSUPPORT)
}
