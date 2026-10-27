// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package client

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/releases"
	"github.com/GSI-HPC/sdash/internal/slurm/versions"
	"github.com/GSI-HPC/sdash/internal/slurm/wire"
)

// Conn is a connection to the slurmrestd of a Client: the data_parser version
// both sides speak and the profile of the server's release. It holds no
// network connection of its own, and serves any number of requests at once.
type Conn struct {
	c *Client
	// Parser is the data_parser version of every request.
	Parser versions.Parser
	// Release is the Slurm release of slurmrestd, which slurmctld and
	// slurmdbd may not share.
	Release releases.Release
	// Profile is how that release behaves.
	Profile releases.Profile
	// Fit says whether sdash was tested on that release line; a newer one
	// gets the profile of the newest line sdash knows.
	Fit releases.Fit
	// operations holds what the server offers, "GET /slurm/{v}/jobs/", with
	// {v} in place of the parser.
	operations map[string]bool
}

// document is what Connect reads of the server's OpenAPI document.
type document struct {
	Info struct {
		Slurm struct {
			DataParsers []struct {
				Plugin string `json:"plugin"`
			} `json:"data_parsers"`
			Release string `json:"release"`
		} `json:"x-slurm"`
	} `json:"info"`
	// The operations of each path, by their method; what an operation says
	// is skipped as it is read.
	Paths map[string]map[string]struct{} `json:"paths"`
}

// Connect reads the server's OpenAPI document, chooses the parser to speak
// and the profile of the server's release, and pings slurmctld: slurmrestd
// serves its document to any token, and only slurmctld tells whether the
// token is good. A server that offers no parser sdash speaks is refused, as
// is a token slurmctld does not accept.
func (c *Client) Connect(ctx context.Context) (*Conn, error) {
	var doc document
	// No profile yet: what HTTP says of a status in general.
	err := c.get(ctx, releases.Profile{}, "/openapi/v3", func(r io.Reader) (wire.Envelope, error) {
		return wire.Envelope{}, json.NewDecoder(r).Decode(&doc)
	})
	if err != nil {
		return nil, fmt.Errorf("read the OpenAPI document: %w", err)
	}

	offered := make([]string, len(doc.Info.Slurm.DataParsers))
	for i, p := range doc.Info.Slurm.DataParsers {
		offered[i] = p.Plugin
	}
	parser, err := versions.Negotiate(offered)
	if err != nil {
		return nil, &errs.Error{Kind: errs.Unsupported, Op: "choose a data_parser version", Err: err}
	}
	release, err := releases.Parse(doc.Info.Slurm.Release)
	if err != nil {
		return nil, &errs.Error{Kind: errs.Protocol, Op: "read the release of slurmrestd", Err: err}
	}
	profile, fit := releases.Lookup(release)

	conn := &Conn{
		c:          c,
		Parser:     parser,
		Release:    release,
		Profile:    profile,
		Fit:        fit,
		operations: map[string]bool{},
	}
	for path, methods := range doc.Paths {
		path = strings.Replace(path, "/"+string(parser)+"/", "/{v}/", 1)
		for method := range methods {
			conn.operations[strings.ToUpper(method)+" "+path] = true
		}
	}

	if _, err := conn.Ping(ctx); err != nil {
		return nil, err
	}
	c.log.Info("connect to slurmrestd", "release", release.String(), "parser", string(parser), "fit", fit.String())
	return conn, nil
}

// Offers tells whether the server offers the operation of method on path, as
// its OpenAPI document names it, with {v} in place of the data_parser
// version: Offers("GET", "/slurm/{v}/job/{job_id}/requeue"). Capabilities ask
// this, never a version.
func (c *Conn) Offers(method, path string) bool {
	return c.operations[strings.ToUpper(method)+" "+path]
}

// path builds the path of a request in the parser of the connection, with
// each name escaped as one segment.
func (c *Conn) path(api, endpoint string, names ...string) string {
	p := "/" + api + "/" + string(c.Parser) + "/" + endpoint
	for _, n := range names {
		p += "/" + url.PathEscape(n)
	}
	return p
}

// Ping pings slurmctld and returns what each controller answered. slurmctld
// answers a ping with a token it does not accept as it answers one it does,
// with a controller that did not respond and Slurm's text of the error, so a
// ping with none responding for that reason is a failure of kind
// Unauthenticated. A controller that does not respond for another reason is
// no failure of the ping's: the answer says so.
func (c *Conn) Ping(ctx context.Context) ([]wire.Ping, error) {
	var answer wire.Pings
	path := c.path("slurm", "ping/")
	if err := c.c.get(ctx, c.Profile, path, decode(&answer)); err != nil {
		return nil, err
	}
	for _, p := range answer.Pings {
		if p.Responding {
			return answer.Pings, nil
		}
	}
	for _, p := range answer.Pings {
		if p.Status == errs.AuthenticationFailure {
			return nil, &errs.Error{
				Kind:    errs.Unauthenticated,
				Op:      "GET " + path,
				Status:  200,
				Number:  errs.NumberAuthentication,
				Message: p.Status,
			}
		}
	}
	return answer.Pings, nil
}

// Jobs streams the job list: each job the user may see goes to each as soon
// as it is decoded. The list is complete, and its envelope free of errors,
// only when Jobs returns nil, so a caller keeps what it gets aside until
// then. An error of each stops the list and is returned as it is.
func (c *Conn) Jobs(ctx context.Context, each func(*wire.Job) error) error {
	return c.c.get(ctx, c.Profile, c.path("slurm", "jobs/"), stream("jobs", each))
}

// Job returns the job of id; an array job answers with each of its tasks.
// A job slurmctld does not know is a failure of kind NotFound.
func (c *Conn) Job(ctx context.Context, id int64) ([]wire.Job, error) {
	var answer wire.Jobs
	if err := c.c.get(ctx, c.Profile, c.path("slurm", "job", fmt.Sprint(id)), decode(&answer)); err != nil {
		return nil, err
	}
	return answer.Jobs, nil
}

// Nodes streams the node list, as Jobs streams the jobs.
func (c *Conn) Nodes(ctx context.Context, each func(*wire.Node) error) error {
	return c.c.get(ctx, c.Profile, c.path("slurm", "nodes/"), stream("nodes", each))
}

// Node returns the node of name. A node slurmctld does not know is a failure
// of kind NotFound.
func (c *Conn) Node(ctx context.Context, name string) (wire.Node, error) {
	var answer wire.Nodes
	path := c.path("slurm", "node", name)
	err := c.c.get(ctx, c.Profile, path, decode(&answer))
	// slurmctld answers a node it does not know with an error without a
	// number, under HTTP 200, and no node.
	if e, ok := errors.AsType[*errs.Error](err); ok && e.Kind == errs.Rejected && e.Number == 0 && len(answer.Nodes) == 0 {
		e.Kind = errs.NotFound
	}
	if err != nil {
		return wire.Node{}, err
	}
	if len(answer.Nodes) != 1 {
		return wire.Node{}, &errs.Error{Kind: errs.Protocol, Op: "GET " + path, Message: fmt.Sprintf("%d nodes in the answer", len(answer.Nodes))}
	}
	return answer.Nodes[0], nil
}

// Partitions returns the partitions.
func (c *Conn) Partitions(ctx context.Context) ([]wire.Partition, error) {
	var answer wire.Partitions
	if err := c.c.get(ctx, c.Profile, c.path("slurm", "partitions/"), decode(&answer)); err != nil {
		return nil, err
	}
	return answer.Partitions, nil
}

// decode reads a small answer whole into v, a struct that embeds the
// envelope.
func decode[T interface{ Head() *wire.Envelope }](v T) reader {
	return func(r io.Reader) (wire.Envelope, error) {
		if err := json.NewDecoder(r).Decode(v); err != nil {
			return wire.Envelope{}, err
		}
		return *v.Head(), nil
	}
}

// stream reads a list as wire.Stream does, and carries an error of each out
// as the caller's.
func stream[T any](key string, each func(*T) error) reader {
	return func(r io.Reader) (wire.Envelope, error) {
		return wire.Stream(r, key, func(v *T) error {
			if err := each(v); err != nil {
				return consumerError{err}
			}
			return nil
		})
	}
}
