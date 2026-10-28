// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cache

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const interval = 30 * time.Second

// upstream is a fake kind of data: each fetch counts, takes the time it is
// told and gives the value or the error it is told.
type upstream struct {
	fetches atomic.Int32
	mu      sync.Mutex
	value   int
	err     error
	takes   time.Duration
}

func (u *upstream) fetch(ctx context.Context) (int, error) {
	u.fetches.Add(1)
	u.mu.Lock()
	v, err, takes := u.value, u.err, u.takes
	u.mu.Unlock()
	if takes > 0 {
		select {
		case <-time.After(takes):
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	return v, err
}

func (u *upstream) set(v int, err error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.value, u.err = v, err
}

// newCache returns a cache of u that ends with the test's bubble.
func newCache(t *testing.T, u *upstream) *Cache[int] {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(func() {
		cancel()
		synctest.Wait()
	})
	return New(ctx, Config[int]{Fetch: u.fetch, Interval: interval})
}

func TestAReadFetchesOnceAndThenServesWhatIsHeld(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{value: 7}
		c := newCache(t, u)

		snap, err := c.Get(t.Context())
		require.NoError(t, err)
		assert.Equal(t, 7, snap.Data)
		assert.Equal(t, uint64(1), snap.Generation)
		assert.Equal(t, time.Now(), snap.Fetched)

		time.Sleep(interval / 2)
		_, err = c.Get(t.Context())
		require.NoError(t, err)
		assert.Equal(t, int32(1), u.fetches.Load(), "nothing is fetched again within a period")
	})
}

func TestReadsAtTheSameTimeShareOneFetch(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{value: 1, takes: time.Second}
		c := newCache(t, u)

		var wg sync.WaitGroup
		for range 5 {
			wg.Go(func() {
				snap, err := c.Get(t.Context())
				assert.NoError(t, err)
				assert.Equal(t, 1, snap.Data)
			})
		}
		wg.Wait()
		assert.Equal(t, int32(1), u.fetches.Load())
	})
}

func TestAWatchedKindIsRefreshedEachPeriodAndNoLongerOnceTheLeaseEnds(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{}
		c := newCache(t, u)

		c.Watch()
		synctest.Wait()
		assert.Equal(t, int32(1), u.fetches.Load(), "a watch fetches at once")

		// The lease of one watch is two periods: the fetch at its start,
		// one after a period, and none at its end.
		time.Sleep(5 * interval)
		synctest.Wait()
		assert.Equal(t, int32(2), u.fetches.Load())

		// Watched all along, the kind is fetched at the first watch and
		// once a period after it.
		for range 4 {
			c.Watch()
			time.Sleep(interval)
			synctest.Wait()
		}
		assert.Equal(t, int32(2+1+4), u.fetches.Load())
	})
}

func TestNothingIsFetchedWithoutAReader(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{}
		c := newCache(t, u)
		time.Sleep(10 * interval)
		synctest.Wait()
		assert.Equal(t, int32(0), u.fetches.Load())
		assert.False(t, c.Peek().Held())
	})
}

func TestTheGenerationGrowsOnlyWhenTheDataChange(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{value: 1}
		c := newCache(t, u)
		_, err := c.Get(t.Context())
		require.NoError(t, err)

		c.Watch()
		time.Sleep(interval)
		synctest.Wait()
		first := c.Peek()
		assert.Equal(t, uint64(1), first.Generation, "the same data again")
		assert.Equal(t, time.Now(), first.Fetched, "but fetched anew")

		u.set(2, nil)
		c.Watch()
		time.Sleep(interval)
		synctest.Wait()
		assert.Equal(t, uint64(2), c.Peek().Generation)
		assert.Equal(t, 2, c.Peek().Data)
	})
}

func TestAFailedFetchKeepsTheDataHeldAndSaysWhy(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{value: 1}
		c := newCache(t, u)
		_, err := c.Get(t.Context())
		require.NoError(t, err)
		fetched := c.Peek().Fetched

		down := errors.New("slurmctld is down")
		u.set(0, down)
		c.Watch()
		time.Sleep(interval)
		synctest.Wait()

		snap, err := c.Get(t.Context())
		require.NoError(t, err, "the data held are still an answer")
		assert.Equal(t, 1, snap.Data)
		assert.Equal(t, fetched, snap.Fetched)
		assert.ErrorIs(t, snap.Err, down)

		u.set(1, nil)
		c.Watch()
		time.Sleep(interval)
		synctest.Wait()
		assert.NoError(t, c.Peek().Err, "a fetch that succeeds clears the failure")
	})
}

func TestAReadWithNothingHeldDoesNotRetryAFailureWithinAPeriod(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		down := errors.New("no route to host")
		u := &upstream{err: down}
		c := newCache(t, u)

		_, err := c.Get(t.Context())
		require.ErrorIs(t, err, down)
		_, err = c.Get(t.Context())
		require.ErrorIs(t, err, down)
		assert.Equal(t, int32(1), u.fetches.Load())

		// The read leased the kind, so the refresh tries again a period
		// later.
		u.set(3, nil)
		time.Sleep(interval)
		synctest.Wait()
		assert.Equal(t, int32(2), u.fetches.Load())
		snap, err := c.Get(t.Context())
		require.NoError(t, err)
		assert.Equal(t, 3, snap.Data)
	})
}

func TestASlowFetchLengthensThePeriod(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{takes: 5 * time.Second}
		c := newCache(t, u)
		assert.Equal(t, interval, c.Period())
		_, err := c.Get(t.Context())
		require.NoError(t, err)
		assert.Equal(t, 50*time.Second, c.Period())
	})
}

func TestAReaderThatGoesAwayDoesNotEndTheFetch(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		u := &upstream{value: 4, takes: time.Second}
		c := newCache(t, u)

		ctx, cancel := context.WithCancel(t.Context())
		go func() {
			time.Sleep(time.Second / 2)
			cancel()
		}()
		_, err := c.Get(ctx)
		require.ErrorIs(t, err, context.Canceled)

		snap, err := c.Get(t.Context())
		require.NoError(t, err)
		assert.Equal(t, 4, snap.Data)
		assert.Equal(t, int32(1), u.fetches.Load())
	})
}
