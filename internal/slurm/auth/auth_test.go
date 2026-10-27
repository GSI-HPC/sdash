// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package auth

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
)

// jwt writes a token of the shape scontrol token writes, with the claims
// given; its signature is no concern of sdash's.
func jwt(claims string) string {
	enc := base64.RawURLEncoding
	return enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`)) + "." +
		enc.EncodeToString([]byte(claims)) + ".c2lnbmF0dXJl"
}

func TestParseReadsTheUserAndTheExpiry(t *testing.T) {
	t.Parallel()
	tok := Parse(jwt(`{"exp": 1767225600, "iat": 1767223800, "sun": "alice"}`) + "\n")
	assert.Equal(t, "alice", tok.User)
	assert.Equal(t, int64(1767225600), tok.Expiry.Unix())
	assert.False(t, strings.HasSuffix(tok.Secret(), "\n"), "the line end is no part of the token")
}

func TestParsePassesOnATokenWhoseClaimsItCannotRead(t *testing.T) {
	t.Parallel()
	for name, s := range map[string]string{
		"no JWT":          "not-a-token",
		"payload no JSON": "a." + base64.RawURLEncoding.EncodeToString([]byte("{")) + ".c",
		"payload no b64":  "a.!!!.c",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			tok := Parse(s)
			assert.Equal(t, s, tok.Secret())
			assert.Empty(t, tok.User)
			assert.True(t, tok.Expiry.IsZero())
			assert.False(t, tok.ExpiredAt(time.Now()), "a token that does not say never expires")
		})
	}
}

// A token printed or logged by mistake gives its secret away nowhere.
func TestATokenPrintsAndLogsWithoutItsSecret(t *testing.T) {
	t.Parallel()
	secret := jwt(`{"exp": 1767225600, "sun": "alice"}`)
	tok := Parse(secret)

	var log strings.Builder
	slog.New(slog.NewTextHandler(&log, nil)).Info("got", "token", tok)
	for _, out := range []string{fmt.Sprint(tok), fmt.Sprintf("%v %+v %s", tok, tok, tok), log.String()} {
		assert.NotContains(t, out, secret)
		assert.NotContains(t, out, strings.Split(secret, ".")[1])
	}
	assert.Equal(t, "token of alice, expires 2026-01-01T00:00:00Z", tok.String())
}

func TestFixedRefusesAnEmptyToken(t *testing.T) {
	t.Parallel()
	_, err := Fixed(" \n").Token(t.Context())
	assert.Error(t, err)
}

// A user who writes a new token into the file renews it.
func TestFileReadsTheTokenAgainEachTime(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "token")
	src := File(path)

	_, err := src.Token(t.Context())
	require.Error(t, err, "no file yet")

	require.NoError(t, os.WriteFile(path, []byte("SLURM_JWT="+jwt(`{"sun": "alice"}`)+"\n"), 0o600))
	tok, err := src.Token(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "alice", tok.User, "the SLURM_JWT= of scontrol token is no part of the token")

	require.NoError(t, os.WriteFile(path, []byte(jwt(`{"sun": "bob"}`)), 0o600))
	tok, err = src.Token(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "bob", tok.User)

	require.NoError(t, os.WriteFile(path, nil, 0o600))
	_, err = src.Token(t.Context())
	assert.Error(t, err, "an empty file")
}

// helperEnv makes the test binary act as a token command; see
// TestHelperCommand.
const helperEnv = "SDASH_AUTH_TEST_COMMAND"

// command is a Source that runs the test binary as a token command that
// does what mode says.
func command(t *testing.T, mode string) Source {
	t.Helper()
	t.Setenv(helperEnv, mode)
	return Command(os.Args[0], "-test.run=^TestHelperCommand$")
}

// TestHelperCommand is no test: it is the token command that command runs.
func TestHelperCommand(_ *testing.T) {
	mode := os.Getenv(helperEnv)
	if mode == "" {
		return
	}
	switch mode {
	case "scontrol":
		fmt.Println("SLURM_JWT=" + jwt(`{"sun": "alice"}`))
	case "chatty":
		fmt.Println("Welcome to the login node")
		fmt.Println(jwt(`{"sun": "bob"}`))
	case "silent":
	case "fails":
		fmt.Fprintln(os.Stderr, "scontrol: error: token creation is disabled")
		os.Exit(1)
	}
	os.Exit(0)
}

// TestCommandTakesTheLastLineItPrints cannot run in parallel: the command
// learns what to do from the environment.
func TestCommandTakesTheLastLineItPrints(t *testing.T) {
	for mode, user := range map[string]string{"scontrol": "alice", "chatty": "bob"} {
		t.Run(mode, func(t *testing.T) {
			tok, err := command(t, mode).Token(t.Context())
			require.NoError(t, err)
			assert.Equal(t, user, tok.User)
		})
	}
}

// TestCommandSaysWhyItGotNoToken cannot run in parallel either.
func TestCommandSaysWhyItGotNoToken(t *testing.T) {
	_, err := command(t, "fails").Token(t.Context())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "token creation is disabled", "the command's own words")

	_, err = command(t, "silent").Token(t.Context())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "printed no token")

	_, err = Command().Token(t.Context())
	assert.Error(t, err)
}

// counting is a Source that hands out the tokens of next, and counts how
// often it is asked.
type counting struct {
	asked atomic.Int32
	next  func(n int) (Token, error)
}

func (c *counting) Token(context.Context) (Token, error) {
	return c.next(int(c.asked.Add(1)))
}

// expiring is a token of user n that expires after life.
func expiring(n int, life time.Duration) Token {
	return Parse(jwt(fmt.Sprintf(`{"sun": "user%d", "exp": %d}`, n, time.Now().Add(life).Unix())))
}

func TestTheKeeperRenewsATokenBeforeItExpires(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		src := &counting{next: func(n int) (Token, error) { return expiring(n, 10*time.Minute), nil }}
		k := NewKeeper(src)

		first, err := k.Token(t.Context())
		require.NoError(t, err)
		again, err := k.Token(t.Context())
		require.NoError(t, err)
		assert.Equal(t, first, again, "a token that lasts is kept")
		assert.Equal(t, int32(1), src.asked.Load())

		time.Sleep(10*time.Minute - renewBefore)
		renewed, err := k.Token(t.Context())
		require.NoError(t, err)
		assert.Equal(t, "user2", renewed.User)
	})
}

func TestTheKeeperAsksAgainForARefusedToken(t *testing.T) {
	t.Parallel()
	src := &counting{next: func(n int) (Token, error) { return expiring(n, time.Hour), nil }}
	k := NewKeeper(src)

	first, err := k.Token(t.Context())
	require.NoError(t, err)
	k.Refused(t.Context(), first)
	second, err := k.Token(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "user2", second.User)

	// A refusal of the first token, reported late, keeps the second.
	k.Refused(t.Context(), first)
	third, err := k.Token(t.Context())
	require.NoError(t, err)
	assert.Equal(t, second, third)
}

func TestTheKeeperUsesATokenItCouldNotRenewForAsLongAsItLasts(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		src := &counting{next: func(n int) (Token, error) {
			if n == 1 {
				return expiring(n, 10*time.Minute), nil
			}
			return Token{}, errors.New("the login node is down")
		}}
		k := NewKeeper(src)
		_, err := k.Token(t.Context())
		require.NoError(t, err)

		time.Sleep(10*time.Minute - renewBefore/2)
		tok, err := k.Token(t.Context())
		require.NoError(t, err, "the token still lasts")
		assert.Equal(t, "user1", tok.User)

		time.Sleep(renewBefore)
		_, err = k.Token(t.Context())
		require.Error(t, err)
		assert.True(t, errs.Is(err, errs.Unauthenticated))
		assert.Contains(t, err.Error(), "the login node is down")
	})
}

// A token from a variable or a file is not renewed: once it has expired,
// sdash says so instead of sending it.
func TestTheKeeperRefusesToSendAnExpiredToken(t *testing.T) {
	t.Parallel()
	k := NewKeeper(Fixed(expiring(1, -time.Minute).Secret()))
	_, err := k.Token(t.Context())
	require.Error(t, err)
	assert.True(t, errs.Is(err, errs.Unauthenticated))
	assert.Contains(t, err.Error(), "has expired")
}

func TestTheKeeperAsksOnceForRequestsThatWait(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		src := &counting{next: func(n int) (Token, error) {
			time.Sleep(time.Second) // a slow command
			return expiring(n, time.Hour), nil
		}}
		k := NewKeeper(src)
		done := make(chan Token)
		for range 5 {
			go func() {
				tok, err := k.Token(t.Context())
				assert.NoError(t, err)
				done <- tok
			}()
		}
		for range 5 {
			assert.Equal(t, "user1", (<-done).User)
		}
		assert.Equal(t, int32(1), src.asked.Load())
	})
}

func TestARequestStopsWaitingForASlowCommandWhenItsContextEnds(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		release := make(chan struct{})
		k := NewKeeper(SourceFunc(func(context.Context) (Token, error) {
			<-release
			return expiring(1, time.Hour), nil
		}))
		go func() { _, _ = k.Token(t.Context()) }() // holds the lock until released
		synctest.Wait()

		ctx, cancel := context.WithTimeout(t.Context(), time.Second)
		defer cancel()
		_, err := k.Token(ctx)
		require.ErrorIs(t, err, context.DeadlineExceeded)
		close(release)
	})
}
