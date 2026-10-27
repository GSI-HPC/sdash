// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build e2e

package e2e

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/auth"
	"github.com/GSI-HPC/sdash/internal/slurm/client"
	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/releases"
	"github.com/GSI-HPC/sdash/internal/slurm/versions"
	"github.com/GSI-HPC/sdash/internal/slurm/wire"
)

// tokenOf is the token command of a profile that gets user's tokens from
// the cluster, as ssh to a login node and scontrol token there would.
func tokenOf(user string) auth.Source {
	return auth.Command("sind", "exec", "--", "scontrol", "token", "username="+user, "lifespan=600")
}

// connect connects the client to the cluster's slurmrestd with tokens of
// src.
func connect(t *testing.T, src auth.Source) (*client.Conn, error) {
	t.Helper()
	c, err := client.New(client.Config{Endpoint: newSlurmrestd(t).base, Tokens: src})
	require.NoError(t, err)
	return c.Connect(t.Context())
}

func TestTheClientConnectsWithTheTokenOfTheUser(t *testing.T) {
	t.Parallel()
	conn, err := connect(t, tokenOf("alice"))
	require.NoError(t, err)

	known := versions.Known()
	assert.Equal(t, known[len(known)-1], conn.Parser, "the newest parser both sides speak")
	assert.Equal(t, releases.Tested, conn.Fit, "the cluster runs %s", conn.Release)
	assert.True(t, conn.Offers("GET", "/slurm/{v}/jobs/"))

	pings, err := conn.Ping(t.Context())
	require.NoError(t, err)
	require.NotEmpty(t, pings)
	assert.True(t, pings[0].Responding)
}

func TestTheClientReadsTheSeededCluster(t *testing.T) {
	t.Parallel()
	conn, err := connect(t, tokenOf("alice"))
	require.NoError(t, err)

	states := map[int64]string{}
	require.NoError(t, conn.Jobs(t.Context(), func(j *wire.Job) error {
		states[j.JobID] = j.State[0]
		return nil
	}))
	assert.Equal(t, "FAILED", states[2])
	assert.Equal(t, "RUNNING", states[4])

	job, err := conn.Job(t.Context(), 2)
	require.NoError(t, err)
	require.Len(t, job, 1)
	code, _ := job[0].ExitCode.ReturnCode.Value()
	assert.Equal(t, int64(3), code)

	_, err = conn.Job(t.Context(), 999999)
	assert.True(t, errs.Is(err, errs.NotFound), "%v", err)

	node, err := conn.Node(t.Context(), "worker-2")
	require.NoError(t, err)
	assert.True(t, slices.Contains(node.State, "DRAIN"), "%v", node.State)
	_, err = conn.Node(t.Context(), "nonexistent")
	assert.True(t, errs.Is(err, errs.NotFound), "%v", err)

	var names []string
	require.NoError(t, conn.Nodes(t.Context(), func(n *wire.Node) error {
		names = append(names, n.Name)
		return nil
	}))
	assert.Equal(t, []string{"worker-0", "worker-1", "worker-2"}, names)

	partitions, err := conn.Partitions(t.Context())
	require.NoError(t, err)
	require.Len(t, partitions, 1)
	assert.Equal(t, "all", partitions[0].Name)
}

// slurmrestd serves its document to any token; the ping of Connect is what
// finds one that slurmctld refuses.
func TestTheClientRefusesATokenSlurmctldRefuses(t *testing.T) {
	t.Parallel()
	_, err := connect(t, auth.Fixed("not-a-token"))
	require.Error(t, err)
	assert.True(t, errs.Is(err, errs.Unauthenticated), "%v", err)
}
