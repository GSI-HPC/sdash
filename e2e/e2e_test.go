// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build e2e

// Package e2e holds the end-to-end tests: the built binary against the Slurm
// cluster that sind creates from testdata/sind-cluster.yaml
// (doc/adr/0016-e2e-and-fixtures-on-sind.md). It builds only with the tag
// e2e, so that go test ./... never needs Docker, and it fails, never skips,
// when the cluster is missing.
package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// slurmrestd is the daemon of the cluster's api node, reached the way sind's
// guide describes: the node's address on port 6820, with a JSON Web Token
// that slurmctld mints for root.
type slurmrestd struct {
	base  string
	user  string
	token string
}

// sind runs the sind command line in the realm of the e2e cluster and returns
// its standard output.
func sind(t *testing.T, args ...string) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	t.Cleanup(cancel)

	cmd := exec.CommandContext(ctx, "sind", args...)
	cmd.Env = append(os.Environ(), "SIND_REALM="+realm())
	out, err := cmd.Output()
	require.NoError(t, err, "sind %s: is the cluster up (make e2e-up)?", strings.Join(args, " "))
	return out
}

// realm is the sind realm of the cluster, which make e2e-up and the CI job
// both set.
func realm() string {
	if r := os.Getenv("SIND_REALM"); r != "" {
		return r
	}
	return "e2e"
}

func newSlurmrestd(t *testing.T) slurmrestd {
	t.Helper()

	var node struct {
		IP string `json:"ip"`
	}
	require.NoError(t, json.Unmarshal(sind(t, "get", "node", "api", "-o", "json"), &node))
	require.NotEmpty(t, node.IP, "the api node has no address")

	s := slurmrestd{base: fmt.Sprintf("http://%s:6820", node.IP)}
	return s.as(t, "root")
}

// as returns the daemon as user reaches it, with a token that slurmctld
// mints for user.
func (s slurmrestd) as(t *testing.T, user string) slurmrestd {
	t.Helper()

	// scontrol prints SLURM_JWT=<token>.
	_, token, found := strings.Cut(strings.TrimSpace(string(sind(t, "exec", "--", "scontrol", "token", "username="+user, "lifespan=600"))), "=")
	require.True(t, found, "scontrol token printed no SLURM_JWT=<token>")

	s.user, s.token = user, token
	return s
}

// get returns the status and the body of a GET.
func (s slurmrestd) get(t *testing.T, path string) (int, []byte) {
	t.Helper()
	return s.do(t, http.MethodGet, path, nil)
}

// do returns the status and the body of a request with the token of s.
func (s slurmrestd) do(t *testing.T, method, path string, body []byte) (int, []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)

	req, err := http.NewRequestWithContext(ctx, method, s.base+path, bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("X-SLURM-USER-NAME", s.user)
	req.Header.Set("X-SLURM-USER-TOKEN", s.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }() // a response already read in full: the close cannot lose data

	reply, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, reply
}

// path returns a path of the daemon's OpenAPI document that ends in suffix
// and starts with prefix, for a data_parser version it serves; which version
// is not the test's business (doc/adr/0005-versions-releases-and-capabilities.md).
func (s slurmrestd) path(t *testing.T, prefix, suffix string) string {
	t.Helper()

	status, body := s.get(t, "/openapi/v3")
	require.Equal(t, http.StatusOK, status)
	var spec struct {
		Paths map[string]json.RawMessage `json:"paths"`
	}
	require.NoError(t, json.Unmarshal(body, &spec))

	var found []string
	for p := range spec.Paths {
		if strings.HasPrefix(p, prefix) && strings.HasSuffix(p, suffix) {
			found = append(found, p)
		}
	}
	if len(found) > 0 {
		// The same one on every call, so that a test reads what another wrote.
		slices.Sort(found)
		return found[len(found)-1]
	}
	require.FailNow(t, "the OpenAPI document has no such path", "%s...%s", prefix, suffix)
	return ""
}

func TestSlurmrestdAnswersPingToARootToken(t *testing.T) {
	t.Parallel()
	s := newSlurmrestd(t)

	status, body := s.get(t, s.path(t, "/slurm/v", "/ping/"))
	require.Equal(t, http.StatusOK, status)
	var reply struct {
		Pings []struct {
			Responding bool `json:"responding"`
		} `json:"pings"`
		Errors []json.RawMessage `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(body, &reply))
	assert.Empty(t, reply.Errors)
	require.NotEmpty(t, reply.Pings)
	assert.True(t, reply.Pings[0].Responding, "slurmctld does not answer the ping")
}

// TestSeedLeavesJobsInEveryState holds seed.sh to its word: the job ids and
// states the fixtures show. It needs a cluster that was seeded no more than
// MinJobAge ago, since slurmctld forgets a finished job after that.
func TestSeedLeavesJobsInEveryState(t *testing.T) {
	t.Parallel()
	s := newSlurmrestd(t)

	status, body := s.get(t, s.path(t, "/slurm/v", "/jobs/"))
	require.Equal(t, http.StatusOK, status)
	var reply struct {
		Jobs []struct {
			JobID    int      `json:"job_id"`
			JobState []string `json:"job_state"`
		} `json:"jobs"`
	}
	require.NoError(t, json.Unmarshal(body, &reply))

	states := map[int][]string{}
	for _, j := range reply.Jobs {
		states[j.JobID] = j.JobState
	}
	assert.Equal(t, map[int][]string{
		1: {"COMPLETED"},
		2: {"FAILED"},
		3: {"CANCELLED"},
		4: {"RUNNING"},
		5: {"RUNNING"},
		6: {"PENDING"},
		7: {"PENDING"},
	}, filter(states, 1, 2, 3, 4, 5, 6, 7))
	assert.Contains(t, states, 8, "the array job is missing")
}

// filter returns the entries of m for the given ids.
func filter(m map[int][]string, ids ...int) map[int][]string {
	out := map[int][]string{}
	for _, id := range ids {
		if v, ok := m[id]; ok {
			out[id] = v
		}
	}
	return out
}

// TestSlurmrestdActsAsTheUserOfTheToken checks what sdash relies on to run
// under the user's own Slurm identity: a job that alice submits through
// slurmrestd belongs to alice, whoever reads it. It leaves one pending job
// of alice's behind, so the capture is taken before the tests.
func TestSlurmrestdActsAsTheUserOfTheToken(t *testing.T) {
	t.Parallel()
	root := newSlurmrestd(t)
	alice := root.as(t, "alice")

	submit := []byte(`{"job": {"name": "identity", "script": "#!/bin/bash\nsleep 60\n", "current_working_directory": "/home/alice", "environment": ["PATH=/usr/bin:/bin"]}}`)
	status, body := alice.do(t, http.MethodPost, alice.path(t, "/slurm/v", "/job/submit"), submit)
	require.Equal(t, http.StatusOK, status, string(body))
	var submitted struct {
		JobID  int               `json:"job_id"`
		Errors []json.RawMessage `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(body, &submitted))
	require.Empty(t, submitted.Errors)
	require.NotZero(t, submitted.JobID)

	status, body = root.get(t, strings.TrimSuffix(root.path(t, "/slurm/v", "/jobs/"), "s/")+fmt.Sprintf("/%d", submitted.JobID))
	require.Equal(t, http.StatusOK, status)
	var job struct {
		Jobs []struct {
			UserName string `json:"user_name"`
		} `json:"jobs"`
	}
	require.NoError(t, json.Unmarshal(body, &job))
	require.Len(t, job.Jobs, 1)
	assert.Equal(t, "alice", job.Jobs[0].UserName)
}
