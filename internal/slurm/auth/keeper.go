// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package auth

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
)

// renewBefore is how long before its expiry a token is renewed. A request
// that starts with a token at its last second can reach slurmctld after it,
// and the clocks of the two machines need not agree.
const renewBefore = time.Minute

// Keeper holds the token of a Source for the requests of one cluster. It asks
// the Source again when the token it holds is about to expire, or when a
// request found it refused. One request at a time asks; the others wait for
// what it gets.
type Keeper struct {
	src Source
	// lock is held while a token is fetched. It is a channel so that a
	// request whose context ends stops waiting for a slow command.
	lock chan struct{}
	held Token
	// user is the user of the last token the Source gave, read without
	// the lock, which a slow command holds.
	user atomic.Pointer[string]
}

// NewKeeper returns a Keeper of the tokens of src.
func NewKeeper(src Source) *Keeper {
	return &Keeper{src: src, lock: make(chan struct{}, 1)}
}

// Token returns the token to send now. A token the Source could not renew
// is used for as long as it lasts; one that has expired is a failure of
// kind Unauthenticated, rather than a request slurmrestd would refuse.
func (k *Keeper) Token(ctx context.Context) (Token, error) {
	select {
	case k.lock <- struct{}{}:
	case <-ctx.Done():
		return Token{}, ctx.Err()
	}
	defer func() { <-k.lock }()

	now := time.Now()
	if !k.held.Empty() && (k.held.Expiry.IsZero() || now.Before(k.held.Expiry.Add(-renewBefore))) {
		return k.held, nil
	}

	t, err := k.src.Token(ctx)
	switch {
	case err != nil && (k.held.Empty() || k.held.ExpiredAt(now)):
		return Token{}, &errs.Error{Kind: errs.Unauthenticated, Op: "get a token", Err: err}
	case err != nil:
		// The one held still lasts; the next request asks again.
		return k.held, nil
	case t.ExpiredAt(now):
		return Token{}, &errs.Error{
			Kind: errs.Unauthenticated,
			Op:   "get a token",
			Err:  fmt.Errorf("the %s has expired", t),
		}
	}
	k.held = t
	k.user.Store(&t.User)
	return t, nil
}

// User returns the user the last token from the Source named: the user
// every request runs as. It is empty before the first token, and for a
// token that does not say.
func (k *Keeper) User() string {
	if u := k.user.Load(); u != nil {
		return *u
	}
	return ""
}

// Refused tells the Keeper that slurmrestd refused t, so that the next
// request asks the Source for another. A token held since is kept.
func (k *Keeper) Refused(ctx context.Context, t Token) {
	select {
	case k.lock <- struct{}{}:
	case <-ctx.Done():
		return
	}
	defer func() { <-k.lock }()
	if k.held.secret == t.secret {
		k.held = Token{}
	}
}
