// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package model

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/versions"
	"github.com/GSI-HPC/sdash/internal/slurm/wire"
)

// captured maps the list under key of a capture of the seeded sind cluster
// (e2e/seed.sh) to the model, in the shape of each parser.
func captured[W, M any](t *testing.T, name, key string, of func(*W) M) map[versions.Parser][]M {
	t.Helper()
	all := map[versions.Parser][]M{}
	for _, p := range versions.Known() {
		body, err := os.ReadFile(filepath.Join("..", "versions", p.Dir(), "testdata", name))
		require.NoError(t, err)
		_, err = wire.Stream(bytes.NewReader(body), key, func(w *W) error {
			all[p] = append(all[p], of(w))
			return nil
		})
		require.NoError(t, err)
	}
	return all
}

func ptr[T any](v T) *T { return &v }

func TestTheSeededJobsMapToTheirStatesIdsAndExitCodes(t *testing.T) {
	t.Parallel()
	for p, jobs := range captured(t, "slurm-jobs.json", "jobs", JobOf) {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			byID := map[int64]Job{}
			for _, j := range jobs {
				byID[j.ID] = j
			}

			failed := byID[2]
			assert.Equal(t, "FAILED", failed.State)
			assert.Equal(t, "2", failed.DisplayID)
			assert.Nil(t, failed.ArrayJobID, "slurmrestd's array 0 is no array")
			assert.Equal(t, &ExitCode{Status: "ERROR", ReturnCode: ptr[int64](3)}, failed.ExitCode)
			assert.Equal(t, "NonZeroExitCode", failed.Reason)

			running := byID[4]
			assert.Equal(t, "RUNNING", running.State)
			assert.Equal(t, "alice", running.User)
			assert.Empty(t, running.Reason, "None is no reason")
			assert.Nil(t, running.ExitCode, "a running job has not ended")
			assert.Nil(t, running.TimeLimit, "the seeded jobs run without a limit")
			require.NotNil(t, running.Started)
			assert.Equal(t, time.UTC, running.Started.Location())

			pending := byID[6]
			assert.Equal(t, "PENDING", pending.State)
			assert.Nil(t, pending.Started, "a start time of 0 is none")
			assert.Equal(t, "Resources", pending.Reason)

			array := byID[8]
			assert.Equal(t, "8_[1-3]", array.DisplayID)
			assert.Equal(t, ptr[int64](8), array.ArrayJobID)
			assert.Equal(t, "1-3", array.ArrayTasks)
		})
	}
}

func TestAnArrayTaskIsWrittenWithItsIndex(t *testing.T) {
	t.Parallel()
	j := JobOf(&wire.Job{
		JobID:       12,
		ArrayJobID:  wire.Int{Set: true, Number: 9},
		ArrayTaskID: wire.Int{Set: true, Number: 3},
		State:       []string{"RUNNING", "COMPLETING"},
	})
	assert.Equal(t, "9_3", j.DisplayID)
	assert.Equal(t, "RUNNING", j.State)
	assert.Equal(t, []string{"COMPLETING"}, j.Flags)
}

func TestTheSeededNodesMapWithTheirStateFlagsAndLoad(t *testing.T) {
	t.Parallel()
	for p, nodes := range captured(t, "slurm-nodes.json", "nodes", NodeOf) {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			require.Len(t, nodes, 3)
			drained := nodes[2]
			assert.Equal(t, "worker-2", drained.Name)
			assert.Equal(t, "IDLE", drained.State)
			assert.Equal(t, []string{"DRAIN"}, drained.Flags)
			assert.Equal(t, "e2e drained", drained.Reason)
			assert.Equal(t, int64(2), drained.CPUs)
			assert.Equal(t, []string{"all"}, drained.Partitions)

			assert.Equal(t, "ALLOCATED", nodes[0].State)
			assert.Equal(t, int64(2), nodes[0].AllocCPUs)
		})
	}
	assert.InDelta(t, 1.5, NodeOf(&wire.Node{CPULoad: 150}).Load, 1e-9, "slurmrestd sends the load times 100")
}

func TestTheSeededPartitionMapsWithItsLimits(t *testing.T) {
	t.Parallel()
	for p, parts := range captured(t, "slurm-partitions.json", "partitions", PartitionOf) {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, []Partition{{
				Name:         "all",
				State:        "UP",
				Nodes:        "worker-[0-2]",
				NodeCount:    3,
				CPUs:         6,
				PriorityTier: 1,
			}}, parts)
		})
	}
}
