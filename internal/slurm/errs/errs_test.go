// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package errs

import (
	"errors"
	"fmt"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAnErrorSaysWhatSlurmrestdSaid(t *testing.T) {
	t.Parallel()
	cases := map[string]struct {
		err  *Error
		want string
	}{
		"an answer with a number": {
			&Error{Kind: NotFound, Op: "GET /job/9", Status: 404, Number: 2017, Message: "Unable to query JobId=9: Invalid job id specified"},
			"GET /job/9: not found (HTTP 404, Slurm error 2017): Unable to query JobId=9: Invalid job id specified",
		},
		"a rejection before any handler": {
			&Error{Kind: Unauthenticated, Op: "GET /ping/", Status: 401, Message: "Authentication failure"},
			"GET /ping/: unauthenticated (HTTP 401): Authentication failure",
		},
		"no answer at all": {
			&Error{Kind: Unavailable, Op: "GET /ping/", Err: io.ErrUnexpectedEOF},
			"GET /ping/: unavailable: unexpected EOF",
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, c.want, c.err.Error())
		})
	}
}

func TestTheKindOfAWrappedErrorIsFound(t *testing.T) {
	t.Parallel()
	err := fmt.Errorf("read the jobs: %w", &Error{Kind: Forbidden, Err: io.EOF})
	assert.Equal(t, Forbidden, KindOf(err))
	assert.True(t, Is(err, Forbidden))
	assert.False(t, Is(err, NotFound))
	assert.ErrorIs(t, err, io.EOF, "the cause is reachable")

	plain := errors.New("not from slurmrestd")
	assert.Equal(t, Protocol, KindOf(plain))
	assert.False(t, Is(plain, Protocol), "an error that is none is of no kind")
}

func TestOnlyNumbersThatSaySomethingHaveAKind(t *testing.T) {
	t.Parallel()
	k, ok := OfNumber(NumberAuthentication)
	assert.True(t, ok)
	assert.Equal(t, Unauthenticated, k)
	for _, n := range []int{0, -1, 9999} {
		_, ok := OfNumber(n)
		assert.False(t, ok, n)
	}
}

func TestEveryKindHasAName(t *testing.T) {
	t.Parallel()
	for k := Protocol; k <= Unsupported; k++ {
		assert.NotContains(t, k.String(), "kind ", int(k))
	}
	assert.Equal(t, "kind 99", Kind(99).String())
}
