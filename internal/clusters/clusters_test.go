// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package clusters

import (
	"context"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/profile"
	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/slurmrestdtest"
	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

// aliceToken is a token of the shape scontrol token writes, which names
// alice; the fake slurmrestd does not check it.
var aliceToken = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256"}`)) + "." +
	base64.RawURLEncoding.EncodeToString([]byte(`{"sun":"alice"}`)) + ".c2ln"

// newest is the newest parser sdash speaks, whose captures the tests run on.
func newest() versions.Parser {
	k := versions.Known()
	return k[len(k)-1]
}

// cluster returns the one cluster of a profile whose slurmrestd is a fake
// that answers with the captures of the seeded sind cluster.
func cluster(t *testing.T) (*Cluster, *slurmrestdtest.Server) {
	t.Helper()
	fake := slurmrestdtest.New(t, newest())
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	set, err := New(ctx, profile.Profile{Clusters: []profile.Cluster{{
		Name:     "virgo",
		Endpoint: fake.URL,
		Token:    profile.Token{Env: "SLURM_JWT"},
	}}}, Options{Getenv: func(string) string { return aliceToken }})
	require.NoError(t, err)
	c, ok := set.Get("virgo")
	require.True(t, ok)
	return c, fake
}

func TestNothingIsSentUntilAKindIsAskedFor(t *testing.T) {
	t.Parallel()
	c, fake := cluster(t)
	assert.Empty(t, fake.Requests())
	assert.Equal(t, State{}, c.State())
}

func TestTheFirstReadConnectsAndFetchesTheKindAsTheUser(t *testing.T) {
	t.Parallel()
	c, fake := cluster(t)
	snap, err := c.Jobs.Get(t.Context())
	require.NoError(t, err)
	assert.Len(t, snap.Data, 8)

	state := c.State()
	assert.True(t, state.Connected)
	assert.Equal(t, "alice", state.User)
	assert.Equal(t, string(newest()), state.Parser)
	assert.NotEmpty(t, state.Release)
	assert.True(t, state.Tested)
	assert.NoError(t, state.Err)

	nodes, err := c.Nodes.Get(t.Context())
	require.NoError(t, err)
	assert.Len(t, nodes.Data, 3)
	parts, err := c.Partitions.Get(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "all", parts.Data[0].Name)
	reservations, err := c.Reservations.Get(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "maintenance", reservations.Data[0].Name)

	connects := 0
	for _, r := range fake.Requests() {
		if r.URL.Path == "/openapi/v3" {
			connects++
		}
	}
	assert.Equal(t, 1, connects, "the kinds share one connection")
}

func TestATokenSlurmctldRefusesFailsTheConnectionAndEveryKind(t *testing.T) {
	t.Parallel()
	c, fake := cluster(t)
	fake.SetToken(slurmrestdtest.Expired)

	_, err := c.Jobs.Get(t.Context())
	assert.True(t, errs.Is(err, errs.Unauthenticated), "%v", err)
	state := c.State()
	assert.False(t, state.Connected)
	assert.True(t, errs.Is(state.Err, errs.Unauthenticated), "%v", state.Err)

	// A new token makes the next attempt connect.
	fake.SetToken(slurmrestdtest.Accepted)
	_, err = c.Nodes.Get(t.Context())
	require.NoError(t, err)
	assert.True(t, c.State().Connected)
}

func TestAClusterWhoseEndpointTheClientCannotUseIsRefused(t *testing.T) {
	t.Parallel()
	_, err := New(t.Context(), profile.Profile{Clusters: []profile.Cluster{{
		Name: "virgo", Endpoint: "ftp://virgo", Token: profile.Token{Env: "T"},
	}}}, Options{})
	assert.ErrorContains(t, err, `cluster "virgo"`)
}

func TestTheSetKeepsTheOrderOfTheProfile(t *testing.T) {
	t.Parallel()
	var p profile.Profile
	for _, name := range []string{"b", "a", "c"} {
		p.Clusters = append(p.Clusters, profile.Cluster{Name: name, Endpoint: "http://" + name, Token: profile.Token{Env: "T"}})
	}
	set, err := New(t.Context(), p, Options{})
	require.NoError(t, err)
	var names []string
	for _, c := range set.All() {
		names = append(names, c.Name)
	}
	assert.Equal(t, []string{"b", "a", "c"}, names)
	_, ok := set.Get("d")
	assert.False(t, ok)
}
