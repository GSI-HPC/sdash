// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package client speaks HTTP to the slurmrestd of one cluster, under the
// user's own Slurm identity (doc/adr/0003-http-to-an-existing-slurmrestd.md).
//
// A Client knows the endpoint and where the token comes from. Connect reads
// the server's OpenAPI document, chooses the data_parser version to speak and
// the profile of the server's Slurm release, and checks with a ping that
// slurmctld accepts the token; the Conn it returns makes the requests. Every
// request carries the User-Agent of doc/adr/0008-user-agent.md and the token
// of an auth.Keeper, and nothing else of the user's.
//
// A failure is an *errs.Error, classified by the Slurm error number of the
// answer first and by its HTTP status, read through the release's profile,
// second (doc/adr/0009-one-tolerant-wire-model.md). A refused token is handed
// back to the Keeper, so that the next request asks for a new one. Lists that
// can be long are decoded as a stream and handed over one element at a time.
//
// The endpoint is an http:// or https:// URL. The unix socket and the route
// through ssh of doc/adr/0006-direct-or-through-ssh.md come later, as other
// transports below the same Client.
package client

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/GSI-HPC/sdash/internal/slurm/auth"
	"github.com/GSI-HPC/sdash/internal/version"
)

// headerTimeout bounds the wait for the header of an answer. slurmrestd
// holds a request that slurmctld's rate limit throttles rather than refuse
// it, so the bound is generous; the body of a long list may take longer
// still, and is bounded by the caller's context alone.
const headerTimeout = 2 * time.Minute

// Config is what a Client needs to know of a cluster.
type Config struct {
	// Endpoint is the URL of slurmrestd, http:// or https://, with the path
	// a proxy serves it under, if any.
	Endpoint string
	// CAFile is a PEM file of the authorities that sign the endpoint's
	// certificate, trusted beside the system's; empty for the system's
	// alone.
	CAFile string
	// Tokens is where the token of each request comes from.
	Tokens auth.Source
	// UserAgent names sdash to the server; empty for that of the running
	// binary.
	UserAgent string
	// Logger receives a line for each request, at debug level, without the
	// token.
	Logger *slog.Logger
	// Transport carries the requests; nil for one of the Client's own. A test
	// hands in its own.
	Transport http.RoundTripper
}

// Client is the slurmrestd of one cluster, before a connection is made.
type Client struct {
	base   *url.URL
	http   *http.Client
	tokens *auth.Keeper
	agent  string
	log    *slog.Logger
}

// New checks cfg and returns a Client of it. It sends nothing yet.
func New(cfg Config) (*Client, error) {
	base, err := endpoint(cfg.Endpoint)
	if err != nil {
		return nil, err
	}
	if cfg.Tokens == nil {
		return nil, errors.New("no source of tokens")
	}
	transport := cfg.Transport
	if transport == nil {
		t, err := newTransport(cfg.CAFile)
		if err != nil {
			return nil, err
		}
		transport = t
	} else if cfg.CAFile != "" {
		return nil, errors.New("a CA file and a transport of one's own exclude each other")
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}
	agent := cfg.UserAgent
	if agent == "" {
		agent = version.UserAgent()
	}
	return &Client{
		base: base,
		http: &http.Client{
			Transport: transport,
			// The token travels in a header of slurmrestd's own, which
			// net/http does not know to drop when a redirect leaves the
			// host. slurmrestd never redirects, so nothing is followed.
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		tokens: auth.NewKeeper(cfg.Tokens),
		agent:  agent,
		log:    logger,
	}, nil
}

// User returns the Slurm user the requests run as, as the last token
// named it; empty before the first request, and for a token that does not
// say.
func (c *Client) User() string {
	return c.tokens.User()
}

// endpoint parses and checks the URL of slurmrestd.
func endpoint(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("endpoint: %w", err)
	}
	switch {
	case u.Scheme != "http" && u.Scheme != "https":
		return nil, fmt.Errorf("endpoint %q: the scheme is http or https", raw)
	case u.Host == "":
		return nil, fmt.Errorf("endpoint %q: no host", raw)
	case u.User != nil:
		// slurmrestd takes a token, never a password, and a URL with one
		// would show it wherever the endpoint is printed.
		return nil, fmt.Errorf("endpoint %q: a user or a password has no place in it", u.Redacted())
	case u.RawQuery != "" || u.Fragment != "":
		return nil, fmt.Errorf("endpoint %q: a query or a fragment has no place in it", raw)
	}
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""
	return u, nil
}

// newTransport returns a transport that trusts the authorities in caFile
// beside the system's.
func newTransport(caFile string) (*http.Transport, error) {
	// The standard library's default transport is an *http.Transport.
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = headerTimeout
	if caFile == "" {
		return t, nil
	}
	pem, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("read the CA file: %w", err)
	}
	pool, err := x509.SystemCertPool()
	if err != nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("the CA file %s holds no certificate", caFile)
	}
	t.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	return t, nil
}
