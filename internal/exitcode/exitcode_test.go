// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package exitcode

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Scripts and service managers branch on the numbers, so a constant that
// moved would break them without any test of behaviour noticing.
func TestTheCodesKeepTheirNumbers(t *testing.T) {
	t.Parallel()

	assert.Equal(t, 0, OK)
	assert.Equal(t, 1, Failure)
	assert.Equal(t, 2, Usage)
}

func TestFromReportsTheCodeAnErrorAsksFor(t *testing.T) {
	t.Parallel()

	plain := errors.New("listener closed")
	tests := []struct {
		name string
		err  error
		want int
	}{
		{name: "no error is OK", err: nil, want: OK},
		{name: "an error without a code is a failure", err: plain, want: Failure},
		{name: "a wrapped error keeps its code", err: Wrap(Usage, plain), want: Usage},
		{
			// A caller adds context with %w on the way up; the code must
			// survive that, or every usage error would exit 1.
			name: "the code survives further wrapping",
			err:  fmt.Errorf("--listen: %w", Wrap(Usage, plain)),
			want: Usage,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, From(tt.err))
		})
	}
}

// A function that returns Wrap(code, err) unconditionally must not turn
// success into an error.
func TestWrapKeepsNilNil(t *testing.T) {
	t.Parallel()

	assert.NoError(t, Wrap(Usage, nil))
}

func TestWrapKeepsTheErrorReachable(t *testing.T) {
	t.Parallel()

	cause := errors.New("not a loopback address")
	err := Wrap(Usage, cause)

	require.ErrorIs(t, err, cause)
	assert.Equal(t, cause.Error(), err.Error())
}
