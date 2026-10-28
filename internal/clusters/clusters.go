// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package clusters owns the clusters sdash serves: for each cluster of the
// profile file, the client of its slurmrestd, the connection to it and a
// cache for each kind of its data
// (doc/adr/0034-cluster-data-in-the-browser-api.md).
//
// Nothing is sent when sdash starts. A cluster connects when a kind of its
// data is first asked for, and each kind is fetched while a viewer asks for
// it (doc/adr/0010-read-through-cache-and-polling.md). Every request runs
// as the user the cluster's token names.
package clusters

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/GSI-HPC/sdash/internal/profile"
	"github.com/GSI-HPC/sdash/internal/slurm/cache"
	"github.com/GSI-HPC/sdash/internal/slurm/client"
	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/model"
	"github.com/GSI-HPC/sdash/internal/slurm/releases"
	"github.com/GSI-HPC/sdash/internal/slurm/wire"
)

// The least time between two fetches of a kind
// (doc/adr/0010-read-through-cache-and-polling.md).
const (
	JobsInterval         = 30 * time.Second
	NodesInterval        = 30 * time.Second
	PartitionsInterval   = 60 * time.Second
	ReservationsInterval = 60 * time.Second
)

// Options is what the clusters are built with besides the profile.
type Options struct {
	// Getenv reads the environment, for a token in a variable.
	Getenv func(string) string
	// Logger receives what the clusters do; nothing is logged without one.
	Logger *slog.Logger
	// Transport carries the requests of every cluster; nil for the client's
	// own. A test hands in its own.
	Transport http.RoundTripper
}

// Set is the clusters of a profile, in its order.
type Set struct {
	list []*Cluster
}

// New builds the clusters of p. It sends nothing; it fails on a cluster
// whose endpoint or CA file the client cannot use. The clusters' fetches end
// with ctx.
func New(ctx context.Context, p profile.Profile, o Options) (*Set, error) {
	getenv := o.Getenv
	if getenv == nil {
		getenv = func(string) string { return "" }
	}
	logger := o.Logger
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}
	s := &Set{}
	for _, pc := range p.Clusters {
		log := logger.With("cluster", pc.Name)
		c, err := client.New(client.Config{
			Endpoint:  pc.Endpoint,
			CAFile:    pc.CAFile,
			Tokens:    pc.Token.Source(getenv),
			Logger:    log,
			Transport: o.Transport,
		})
		if err != nil {
			return nil, fmt.Errorf("cluster %q: %w", pc.Name, err)
		}
		s.list = append(s.list, newCluster(ctx, pc, c, log))
	}
	return s, nil
}

// All returns the clusters, in the order of the profile.
func (s *Set) All() []*Cluster {
	return s.list
}

// Get returns the cluster of the name, and false when there is none.
func (s *Set) Get(name string) (*Cluster, bool) {
	for _, c := range s.list {
		if c.Name == name {
			return c, true
		}
	}
	return nil, false
}

// Cluster is one cluster of the profile.
type Cluster struct {
	// Name is how the profile names the cluster.
	Name string
	// Endpoint is the URL of its slurmrestd.
	Endpoint string

	Jobs         *cache.Cache[[]model.Job]
	Nodes        *cache.Cache[[]model.Node]
	Partitions   *cache.Cache[[]model.Partition]
	Reservations *cache.Cache[[]model.Reservation]

	ctx    context.Context
	client *client.Client
	log    *slog.Logger

	mu   sync.Mutex
	conn *client.Conn
	// connErr is the failure of the last attempt to connect, nil once one
	// succeeded.
	connErr error
	// connecting is closed when the attempt that runs ends; nil when none
	// runs.
	connecting chan struct{}
}

func newCluster(ctx context.Context, pc profile.Cluster, c *client.Client, log *slog.Logger) *Cluster {
	cl := &Cluster{Name: pc.Name, Endpoint: pc.Endpoint, ctx: ctx, client: c, log: log}
	cl.Jobs = cache.New(ctx, cache.Config[[]model.Job]{
		Interval: JobsInterval,
		Fetch: func(ctx context.Context) ([]model.Job, error) {
			return list(ctx, cl, func(conn *client.Conn, each func(*wire.Job) error) error {
				return conn.Jobs(ctx, each)
			}, model.JobOf)
		},
	})
	cl.Nodes = cache.New(ctx, cache.Config[[]model.Node]{
		Interval: NodesInterval,
		Fetch: func(ctx context.Context) ([]model.Node, error) {
			return list(ctx, cl, func(conn *client.Conn, each func(*wire.Node) error) error {
				return conn.Nodes(ctx, each)
			}, model.NodeOf)
		},
	})
	cl.Partitions = cache.New(ctx, cache.Config[[]model.Partition]{
		Interval: PartitionsInterval,
		Fetch: func(ctx context.Context) ([]model.Partition, error) {
			return list(ctx, cl, func(conn *client.Conn, each func(*wire.Partition) error) error {
				return all(conn.Partitions(ctx))(each)
			}, model.PartitionOf)
		},
	})
	cl.Reservations = cache.New(ctx, cache.Config[[]model.Reservation]{
		Interval: ReservationsInterval,
		Fetch: func(ctx context.Context) ([]model.Reservation, error) {
			return list(ctx, cl, func(conn *client.Conn, each func(*wire.Reservation) error) error {
				return all(conn.Reservations(ctx))(each)
			}, model.ReservationOf)
		},
	})
	return cl
}

// list fetches a list through the connection and maps each element to the
// model. The list is given only whole: slurmrestd writes the errors of an
// answer after the list, so a list that ends in a failure is no list.
func list[W, M any](ctx context.Context, c *Cluster, fetch func(*client.Conn, func(*W) error) error, of func(*W) M) ([]M, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	all := []M{}
	err = fetch(conn, func(w *W) error {
		all = append(all, of(w))
		return nil
	})
	if errs.Is(err, errs.Unsupported) {
		// The server no longer offers what the connection was made for, as
		// after an upgrade of slurmrestd: the next fetch connects anew.
		c.drop(conn)
	}
	if err != nil {
		return nil, err
	}
	return all, nil
}

// all hands each element of a list read whole to each, as a streamed list
// is handed: list takes either.
func all[W any](got []W, err error) func(func(*W) error) error {
	return func(each func(*W) error) error {
		if err != nil {
			return err
		}
		for i := range got {
			if err := each(&got[i]); err != nil {
				return err
			}
		}
		return nil
	}
}

// State is what a cluster's connection is at one moment.
type State struct {
	// Connected says whether a connection was made. A request through it
	// can still fail; the cache of each kind says so.
	Connected bool
	// Release is the Slurm release of slurmrestd and Parser the
	// data_parser version both sides speak; both empty until connected.
	Release, Parser string
	// Tested says whether sdash was tested on the release line of
	// slurmrestd; a newer line is spoken to with the profile of the newest
	// one sdash knows.
	Tested bool
	// User is the Slurm user the requests run as; empty until a token
	// named one.
	User string
	// Err is the failure of the last attempt to connect; nil once one
	// succeeded, and before the first.
	Err error
}

// State returns the state of the cluster's connection.
func (c *Cluster) State() State {
	c.mu.Lock()
	defer c.mu.Unlock()
	s := State{User: c.client.User(), Err: c.connErr}
	if c.conn != nil {
		s.Connected = true
		s.Release = c.conn.Release.String()
		s.Parser = string(c.conn.Parser)
		s.Tested = c.conn.Fit == releases.Tested
	}
	return s
}

// connect returns the connection, and makes it if there is none: one
// attempt at a time, which the others wait for.
func (c *Cluster) connect(ctx context.Context) (*client.Conn, error) {
	c.mu.Lock()
	if c.conn != nil {
		defer c.mu.Unlock()
		return c.conn, nil
	}
	wait := c.connecting
	if wait == nil {
		wait = make(chan struct{})
		c.connecting = wait
		go c.dial(wait)
	}
	c.mu.Unlock()

	select {
	case <-wait:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return nil, c.connErr
	}
	return c.conn, nil
}

// dial makes the connection, with the context of the cluster, so that a
// fetch that gives up does not end an attempt another one waits for.
func (c *Cluster) dial(done chan struct{}) {
	conn, err := c.client.Connect(c.ctx)
	c.mu.Lock()
	c.conn, c.connErr, c.connecting = conn, err, nil
	c.mu.Unlock()
	close(done)
	if err != nil {
		c.log.Warn("cannot connect to slurmrestd", "endpoint", c.Endpoint, "error", err)
	}
}

// drop forgets conn, unless another connection has replaced it since.
func (c *Cluster) drop(conn *client.Conn) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == conn {
		c.conn = nil
	}
}
