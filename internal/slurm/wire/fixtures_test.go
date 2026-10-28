// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package wire

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

// fixture reads an answer captured on the sind cluster of e2e/testdata, in
// the shape of parser p.
func fixture(t *testing.T, p versions.Parser, name string) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("..", "versions", p.Dir(), "testdata", name))
	require.NoError(t, err)
	return body
}

// streamAll streams the collection under key of body into a slice.
func streamAll[T any](t *testing.T, body []byte, key string) ([]T, Envelope) {
	t.Helper()
	var all []T
	env, err := Stream(bytes.NewReader(body), key, func(v *T) error {
		all = append(all, *v)
		return nil
	})
	require.NoError(t, err)
	return all, env
}

// The jobs of e2e/seed.sh, in the states it leaves them in, as each parser
// sends them.
func TestTheSeededJobsDecode(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			jobs, env := streamAll[Job](t, fixture(t, p, "slurm-jobs.json"), "jobs")
			assert.Empty(t, env.Errors)
			assert.NotEmpty(t, env.Meta.Slurm.Release)

			byID := map[int64]Job{}
			for _, j := range jobs {
				byID[j.JobID] = j
			}
			states := map[int64]string{}
			for id, j := range byID {
				require.NotEmpty(t, j.State, "job %d has no state", id)
				states[id] = j.State[0]
			}
			assert.Equal(t, map[int64]string{
				1: "COMPLETED", 2: "FAILED", 3: "CANCELLED", 4: "RUNNING",
				5: "RUNNING", 6: "PENDING", 7: "PENDING", 8: "PENDING",
			}, states)

			failed := byID[2]
			code, ok := failed.ExitCode.ReturnCode.Value()
			assert.True(t, ok)
			assert.Equal(t, int64(3), code, "seed.sh fails job 2 with exit 3")
			assert.Equal(t, "alice", failed.UserName)

			running := byID[5]
			assert.Equal(t, "bob", running.UserName)
			start, ok := running.StartTime.Value()
			assert.True(t, ok, "a running job has started")
			submit, _ := running.SubmitTime.Value()
			assert.False(t, start.Before(submit), "a job starts after its submission")
			_, ok = running.TimeLimit.Value()
			assert.False(t, ok, "the partition sets no limit")

			pending := byID[6]
			_, ok = pending.StartTime.Value()
			assert.False(t, ok, "a pending job has not started")
			assert.Equal(t, "high", pending.QOS)

			assert.True(t, byID[7].Hold || byID[7].StateReason != "", "job 7 is held")
			array, ok := byID[8].ArrayJobID.Value()
			assert.True(t, ok)
			assert.Equal(t, int64(8), array)
			assert.Equal(t, "1-3", byID[8].ArrayTasks)
		})
	}
}

func TestTheSeededNodesDecode(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			nodes, env := streamAll[Node](t, fixture(t, p, "slurm-nodes.json"), "nodes")
			assert.Empty(t, env.Errors)
			names := make([]string, len(nodes))
			for i, n := range nodes {
				names[i] = n.Name
				assert.Positive(t, n.CPUs, n.Name)
			}
			assert.Equal(t, []string{"worker-0", "worker-1", "worker-2"}, names)

			var drained Nodes
			require.NoError(t, json.Unmarshal(fixture(t, p, "slurm-node-worker-2-drained.json"), &drained))
			require.Len(t, drained.Nodes, 1)
			assert.Contains(t, drained.Nodes[0].State, "DRAIN")
			assert.Equal(t, "e2e drained", drained.Nodes[0].Reason)
			assert.Equal(t, []string{"all"}, drained.Nodes[0].Partitions)
		})
	}
}

func TestTheSeededPartitionDecodes(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			var answer Partitions
			require.NoError(t, json.Unmarshal(fixture(t, p, "slurm-partitions.json"), &answer))
			require.Len(t, answer.Partitions, 1)
			all := answer.Partitions[0]
			assert.Equal(t, "all", all.Name)
			assert.Equal(t, "worker-[0-2]", all.Nodes.Configured)
			assert.Equal(t, int64(3), all.Nodes.Total)
			assert.Equal(t, int64(6), all.CPUs.Total)
			assert.Equal(t, []string{"UP"}, all.Partition.State)
			assert.True(t, all.Maximums.Time.Infinite, "the partition sets no limit")
		})
	}
}

func TestTheSeededReservationDecodes(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			var answer Reservations
			require.NoError(t, json.Unmarshal(fixture(t, p, "slurm-reservations.json"), &answer))
			require.Len(t, answer.Reservations, 1)
			maint := answer.Reservations[0]
			assert.Equal(t, "maintenance", maint.Name)
			assert.Equal(t, "worker-2", maint.NodeList)
			assert.Equal(t, int64(1), maint.NodeCount)
			assert.Equal(t, int64(2), maint.CoreCount)
			assert.Equal(t, []string{"MAINT", "SPEC_NODES"}, maint.Flags)
			assert.Equal(t, "root", maint.Users)
			start, ok := maint.StartTime.Value()
			require.True(t, ok)
			end, ok := maint.EndTime.Value()
			require.True(t, ok)
			assert.Equal(t, time.Hour, end.Sub(start), "the seed reserves the node for an hour")
		})
	}
}

func TestThePingDecodes(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			var answer Pings
			require.NoError(t, json.Unmarshal(fixture(t, p, "slurm-ping.json"), &answer))
			require.Len(t, answer.Pings, 1)
			assert.True(t, answer.Pings[0].Responding)
			assert.True(t, answer.Pings[0].Primary)
			assert.Equal(t, "controller", answer.Pings[0].Hostname)
			assert.True(t, strings.HasSuffix(answer.Meta.Plugin.DataParser, string(p)))
		})
	}
}

// Streaming has to give what decoding the whole body gives, for every list
// that was captured.
func TestStreamingGivesWhatDecodingTheWholeBodyGives(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		for _, name := range []string{"slurm-jobs.json", "slurm-jobs-as-alice.json", "slurm-job-8.json"} {
			t.Run(string(p)+" "+name, func(t *testing.T) {
				t.Parallel()
				body := fixture(t, p, name)
				var whole Jobs
				require.NoError(t, json.Unmarshal(body, &whole))
				streamed, env := streamAll[Job](t, body, "jobs")
				assert.Equal(t, whole.Jobs, streamed)
				assert.Equal(t, whole.Envelope, env)
			})
		}
		t.Run(string(p)+" slurm-nodes.json", func(t *testing.T) {
			t.Parallel()
			body := fixture(t, p, "slurm-nodes.json")
			var whole Nodes
			require.NoError(t, json.Unmarshal(body, &whole))
			streamed, env := streamAll[Node](t, body, "nodes")
			assert.Equal(t, whole.Nodes, streamed)
			assert.Equal(t, whole.Envelope, env)
		})
	}
}

func TestStreamReadsTheEnvelopeAfterTheCollection(t *testing.T) {
	t.Parallel()
	body := `{"jobs": [{"job_id": 1}, {"job_id": 2}], "meta": {"slurm": {"cluster": "c"}},
		"errors": [{"error_number": 2017, "description": "d"}], "warnings": [{"description": "w"}]}`
	var seen []int64
	env, err := Stream(strings.NewReader(body), "jobs", func(j *Job) error {
		seen = append(seen, j.JobID)
		return nil
	})
	require.NoError(t, err)
	assert.Equal(t, []int64{1, 2}, seen)
	assert.Equal(t, "c", env.Meta.Slurm.Cluster)
	assert.Equal(t, []Error{{Number: 2017, Description: "d"}}, env.Errors)
	assert.Equal(t, []Warning{{Description: "w"}}, env.Warnings)
}

func TestStreamHandsOverAValueEachElementMayKeep(t *testing.T) {
	t.Parallel()
	var kept []*Job
	_, err := Stream(strings.NewReader(`{"jobs": [{"job_id": 1}, {"job_id": 2}]}`), "jobs", func(j *Job) error {
		kept = append(kept, j)
		return nil
	})
	require.NoError(t, err)
	require.Len(t, kept, 2)
	assert.Equal(t, int64(1), kept[0].JobID, "the second element overwrote the first")
}

func TestStreamStopsAtTheFirstErrorOfEach(t *testing.T) {
	t.Parallel()
	stop := errors.New("stop")
	var seen int
	_, err := Stream(strings.NewReader(`{"jobs": [{"job_id": 1}, {"job_id": 2}]}`), "jobs", func(*Job) error {
		seen++
		return stop
	})
	require.ErrorIs(t, err, stop)
	assert.Equal(t, 1, seen)
}

func TestStreamTakesAMissingOrNullCollectionForAnEmptyOne(t *testing.T) {
	t.Parallel()
	for _, body := range []string{`{"jobs": null, "errors": []}`, `{"errors": []}`, `{"jobs": []}`} {
		_, err := Stream(strings.NewReader(body), "jobs", func(*Job) error {
			t.Errorf("an element in %s", body)
			return nil
		})
		assert.NoError(t, err, body)
	}
}

func TestStreamRefusesWhatIsNoAnswer(t *testing.T) {
	t.Parallel()
	for _, body := range []string{
		"Authentication failure",
		"",
		`[]`,
		`{"jobs": {}}`,
		`{"jobs": [{"job_id": "one"}]}`,
		`{"jobs": [{"job_id": 1}`,
		`{"meta": 3}`,
	} {
		_, err := Stream(strings.NewReader(body), "jobs", func(*Job) error { return nil })
		assert.Error(t, err, body)
	}
}

func TestNumberIsAValueOnlyWhenSetAndFinite(t *testing.T) {
	t.Parallel()
	cases := map[string]struct {
		n    Int
		ok   bool
		want int64
	}{
		"set":       {Int{Set: true, Number: 5}, true, 5},
		"unset":     {Int{Number: 5}, false, 0},
		"unlimited": {Int{Set: true, Infinite: true, Number: 5}, false, 0},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			v, ok := c.n.Value()
			assert.Equal(t, c.ok, ok)
			assert.Equal(t, c.want, v)
		})
	}
}

func TestATimeOfZeroIsUnset(t *testing.T) {
	t.Parallel()
	_, ok := Time{Set: true}.Value()
	assert.False(t, ok)
	when, ok := Time{Set: true, Number: 1767225600}.Value()
	assert.True(t, ok)
	assert.Equal(t, int64(1767225600), when.Unix())
}

// FuzzStream holds Stream to what decoding the whole body gives, for any
// input: it never panics, and what it accepts json.Unmarshal reads the same.
func FuzzStream(f *testing.F) {
	for _, p := range versions.Known() {
		// One job: a seed the size of the list slows every run of the target.
		for _, name := range []string{"slurm-job-2.json"} {
			body, err := os.ReadFile(filepath.Join("..", "versions", p.Dir(), "testdata", name))
			if err != nil {
				f.Fatal(err)
			}
			f.Add(body)
		}
	}
	f.Add([]byte(`{"jobs": null}`))
	f.Add([]byte(`Authentication failure`))
	f.Fuzz(func(t *testing.T, body []byte) {
		var streamed []Job
		env, err := Stream(bytes.NewReader(body), "jobs", func(j *Job) error {
			streamed = append(streamed, *j)
			return nil
		})
		if err != nil {
			return
		}
		var whole Jobs
		if json.Unmarshal(body, &whole) != nil {
			// The decoder of a stream reads one value and stops; trailing
			// bytes after it are no concern of an answer's.
			return
		}
		if !slices.EqualFunc(whole.Jobs, streamed, func(a, b Job) bool { return jsonEqual(a, b) }) {
			t.Errorf("streamed %d jobs, the whole body has %d", len(streamed), len(whole.Jobs))
		}
		if !jsonEqual(whole.Envelope, env) {
			t.Errorf("the envelopes differ")
		}
	})
}

// jsonEqual compares two values by their encoding, so that a nil and an
// empty slice count as the same.
func jsonEqual(a, b any) bool {
	x, errA := json.Marshal(a)
	y, errB := json.Marshal(b)
	return errA == nil && errB == nil && bytes.Equal(bytes.ReplaceAll(x, []byte("null"), []byte("[]")), bytes.ReplaceAll(y, []byte("null"), []byte("[]")))
}
