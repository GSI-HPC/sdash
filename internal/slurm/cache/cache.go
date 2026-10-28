// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package cache owns the read-through cache of one kind of a cluster's
// data, the jobs or the nodes, say
// (doc/adr/0010-read-through-cache-and-polling.md).
//
// slurmrestd is stateless, and every request to it is one or more remote
// procedure calls to slurmctld, which every user of the cluster shares. So a
// kind is fetched no more often than its period, one fetch at a time, and
// only while someone looks: each read or Watch extends a lease, and a
// refresh runs in the background only while the lease lasts. Without a
// viewer sdash sends nothing upstream.
//
// A fetch that fails leaves the data held before it in place, with the
// failure beside it, so that a view goes on showing what it had, and says
// how old that is.
package cache

import (
	"context"
	"reflect"
	"sync"
	"time"
)

const (
	// leasePeriods is how many periods a read or a Watch keeps the kind
	// refreshed. The browser asks more often than once a period while a
	// view is open, and stops when its tab is hidden.
	leasePeriods = 2
	// floorFactor is how many times the last fetch the period lasts at
	// least, so that a cluster whose answers are slow is asked less often.
	floorFactor = 10
)

// Snapshot is what the cache holds of its kind at one moment.
type Snapshot[T any] struct {
	// Data is the data of the last fetch that succeeded.
	Data T
	// Generation counts the changes of Data: it grows with each fetch that
	// brings data that differ from those held. It is 0 while nothing is
	// held.
	Generation uint64
	// Fetched is when Data was fetched; zero while nothing is held.
	Fetched time.Time
	// Err is the failure of the last fetch, nil when it succeeded. Data then
	// stays that of an earlier one.
	Err error
}

// Held tells whether the snapshot holds data.
func (s Snapshot[T]) Held() bool {
	return s.Generation > 0
}

// Config is what a Cache needs.
type Config[T any] struct {
	// Fetch fetches the whole of the kind. It is called with the context of
	// the cache, so that a reader that goes away does not end a fetch
	// another reader waits for.
	Fetch func(ctx context.Context) (T, error)
	// Interval is the least time between two fetches.
	Interval time.Duration
	// Equal tells whether two fetches brought the same data; nil compares
	// them with reflect.DeepEqual.
	Equal func(a, b T) bool
}

// Cache holds one kind of a cluster's data.
type Cache[T any] struct {
	ctx      context.Context
	fetch    func(context.Context) (T, error)
	interval time.Duration
	equal    func(a, b T) bool

	mu   sync.Mutex
	snap Snapshot[T]
	// attempted is when the last fetch ended, and took how long the last
	// one that succeeded lasted.
	attempted time.Time
	took      time.Duration
	// watchedUntil is when the lease ends.
	watchedUntil time.Time
	// refreshing is set while the goroutine of the background refresh
	// runs.
	refreshing bool
	// flight is closed when the fetch that runs ends; nil when none runs.
	flight chan struct{}
}

// New returns a cache of cfg. Its fetches and its refresh end with ctx.
func New[T any](ctx context.Context, cfg Config[T]) *Cache[T] {
	equal := cfg.Equal
	if equal == nil {
		equal = func(a, b T) bool { return reflect.DeepEqual(a, b) }
	}
	return &Cache[T]{ctx: ctx, fetch: cfg.Fetch, interval: cfg.Interval, equal: equal}
}

// Get returns what the cache holds, and extends the lease. While it holds
// nothing it fetches, and waits for the fetch until ctx ends; a fetch that
// failed less than a period ago is not tried again and its failure is
// returned. Once it holds data, Get returns them at once, with the failure
// of a later fetch in Snapshot.Err and no error of its own.
func (c *Cache[T]) Get(ctx context.Context) (Snapshot[T], error) {
	c.mu.Lock()
	c.watchLocked()
	if c.snap.Held() {
		defer c.mu.Unlock()
		return c.snap, nil
	}
	if c.flight == nil && c.snap.Err != nil && time.Since(c.attempted) < c.periodLocked() {
		defer c.mu.Unlock()
		return c.snap, c.snap.Err
	}
	flight := c.startLocked()
	c.mu.Unlock()

	select {
	case <-flight:
	case <-ctx.Done():
		return Snapshot[T]{}, ctx.Err()
	}
	snap := c.Peek()
	if !snap.Held() {
		return snap, snap.Err
	}
	return snap, nil
}

// Peek returns what the cache holds, and neither fetches nor extends the
// lease.
func (c *Cache[T]) Peek() Snapshot[T] {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.snap
}

// Watch extends the lease, as a read does, without waiting for data.
func (c *Cache[T]) Watch() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.watchLocked()
}

// Period returns the time between two fetches while the kind is watched:
// the interval, or ten times the last fetch when that is longer.
func (c *Cache[T]) Period() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.periodLocked()
}

func (c *Cache[T]) periodLocked() time.Duration {
	return max(c.interval, floorFactor*c.took)
}

// watchLocked extends the lease and starts the refresh if it does not run.
func (c *Cache[T]) watchLocked() {
	c.watchedUntil = time.Now().Add(leasePeriods * c.periodLocked())
	if !c.refreshing && c.ctx.Err() == nil {
		c.refreshing = true
		go c.refresh()
	}
}

// refresh fetches each period for as long as the lease lasts.
func (c *Cache[T]) refresh() {
	for {
		c.mu.Lock()
		now := time.Now()
		if c.ctx.Err() != nil || !now.Before(c.watchedUntil) {
			c.refreshing = false
			c.mu.Unlock()
			return
		}
		due := c.attempted.Add(c.periodLocked())
		var flight chan struct{}
		if c.flight != nil || c.attempted.IsZero() || !now.Before(due) {
			flight = c.startLocked()
		}
		wait := min(due.Sub(now), c.watchedUntil.Sub(now))
		c.mu.Unlock()

		if flight != nil {
			select {
			case <-flight:
			case <-c.ctx.Done():
			}
			continue
		}
		timer := time.NewTimer(wait)
		select {
		case <-timer.C:
		case <-c.ctx.Done():
			timer.Stop()
		}
	}
}

// startLocked starts a fetch, or joins the one that runs, and returns the
// channel that is closed when it ends.
func (c *Cache[T]) startLocked() chan struct{} {
	if c.flight != nil {
		return c.flight
	}
	flight := make(chan struct{})
	c.flight = flight
	go func() {
		start := time.Now()
		data, err := c.fetch(c.ctx)
		end := time.Now()

		c.mu.Lock()
		c.attempted = end
		c.snap.Err = err
		if err == nil {
			c.took = end.Sub(start)
			if !c.snap.Held() || !c.equal(c.snap.Data, data) {
				c.snap.Data = data
				c.snap.Generation++
			}
			c.snap.Fetched = end
		}
		c.flight = nil
		c.mu.Unlock()
		close(flight)
	}()
	return flight
}
