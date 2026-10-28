// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

//go:build e2e

package e2e

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/api"
)

// binary builds the sdash of this checkout once for all tests, with the
// placeholder interface: the tests read the browser API, not the pages.
var binary = sync.OnceValues(func() (string, error) {
	dir, err := os.MkdirTemp("", "sdash-e2e-")
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "sdash")
	out, err := exec.Command("go", "build", "-o", path, "../cmd/sdash").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("go build: %w: %s", err, out)
	}
	return path, nil
})

// browser is a signed-in browser of an sdash that runs as a process of the
// test, with the profile file it was handed.
type browser struct {
	client *http.Client
	base   string
}

// startSdash runs the built binary with a profile file of the text given and
// the environment env beside the test's own, and signs in to it.
func startSdash(t *testing.T, profile string, env ...string) browser {
	t.Helper()
	bin, err := binary()
	require.NoError(t, err)

	config := filepath.Join(t.TempDir(), "clusters.toml")
	require.NoError(t, os.WriteFile(config, []byte(profile), 0o600))

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, bin, "--no-browser", "--listen", "127.0.0.1:0", "--config", config)
	cmd.Env = append(os.Environ(), append([]string{"SIND_REALM=" + realm()}, env...)...)
	stdout, err := cmd.StdoutPipe()
	require.NoError(t, err)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	require.NoError(t, cmd.Start())
	t.Cleanup(func() {
		cancel()
		_ = cmd.Wait()
	})

	line, err := bufio.NewReader(stdout).ReadString('\n')
	require.NoError(t, err, "sdash ended before it said where it serves: %s", stderr.String())
	address, found := strings.CutPrefix(strings.TrimSpace(line), "sdash is serving at ")
	require.True(t, found, "sdash printed %q", line)

	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	b := browser{client: &http.Client{Jar: jar, Timeout: time.Minute}}
	t.Cleanup(b.client.CloseIdleConnections)
	resp, err := b.client.Get(address)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	u, err := url.Parse(address)
	require.NoError(t, err)
	b.base = "http://" + u.Host + "/api/v1"
	return b
}

// get asks the API for path and decodes the answer into v, or into an
// api.Error when its status is not want.
func (b browser) get(t *testing.T, path string, want int, v any) {
	t.Helper()
	resp, err := b.client.Get(b.base + path)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != want {
		var body api.Error
		_ = json.NewDecoder(resp.Body).Decode(&body)
		require.FailNow(t, "unexpected status", "GET %s: %d, want %d: %s: %s", path, resp.StatusCode, want, body.Code, body.Message)
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(v))
}

// profileOf is the profile file of the e2e cluster, with the token of the
// table given.
func profileOf(t *testing.T, token string) string {
	t.Helper()
	return fmt.Sprintf("[[cluster]]\nname = \"e2e\"\nendpoint = %q\ntoken = %s\n", newSlurmrestd(t).base, token)
}

// A profile whose token command is that of a login node, as the
// documentation suggests, gives the browser the seeded cluster as alice
// sees it, and none of slurmrestd's shapes.
func TestSdashServesTheSeededClusterAsTheUserOfTheToken(t *testing.T) {
	t.Parallel()
	b := startSdash(t, profileOf(t,
		`{ command = ["sind", "exec", "--", "scontrol", "token", "username=alice", "lifespan=600"] }`))

	var status api.Status
	b.get(t, "/status", http.StatusOK, &status)
	require.Len(t, status.Clusters, 1)
	assert.Equal(t, "e2e", status.Clusters[0].Name)

	var jobs api.JobList
	b.get(t, "/clusters/e2e/jobs?sort=id", http.StatusOK, &jobs)
	byID := map[int64]api.Job{}
	for _, j := range jobs.Rows {
		byID[j.Id] = j
	}
	require.Contains(t, byID, int64(2))
	assert.Equal(t, "FAILED", byID[2].State)
	require.NotNil(t, byID[2].ExitCode)
	assert.Equal(t, int64(3), *byID[2].ExitCode.ReturnCode)
	assert.Equal(t, "RUNNING", byID[4].State)
	assert.Equal(t, "bob", byID[5].User)
	assert.Equal(t, int64(1), jobs.Generation)

	var pending api.JobList
	b.get(t, "/clusters/e2e/jobs?state=PENDING&user=alice&limit=1", http.StatusOK, &pending)
	require.Len(t, pending.Rows, 1)
	assert.Equal(t, int64(6), pending.Rows[0].Id)
	assert.GreaterOrEqual(t, pending.Total, 2, "jobs 6 and 8 at least")

	var nodes api.NodeList
	b.get(t, "/clusters/e2e/nodes", http.StatusOK, &nodes)
	require.Len(t, nodes.Rows, 3)
	assert.Equal(t, "worker-2", nodes.Rows[2].Name)
	assert.Contains(t, nodes.Rows[2].Flags, "DRAIN")

	var parts api.PartitionList
	b.get(t, "/clusters/e2e/partitions", http.StatusOK, &parts)
	require.Len(t, parts.Rows, 1)
	assert.Equal(t, "all", parts.Rows[0].Name)

	var pulse api.Pulse
	b.get(t, "/clusters/e2e/pulse?kinds=jobs&kinds=nodes", http.StatusOK, &pulse)
	assert.True(t, pulse.Connection.Connected)
	require.NotNil(t, pulse.Connection.User)
	assert.Equal(t, "alice", *pulse.Connection.User)
	require.NotNil(t, pulse.Connection.Tested)
	assert.True(t, *pulse.Connection.Tested)
	require.Len(t, pulse.Kinds, 2)
	assert.Equal(t, int64(1), pulse.Kinds[0].Generation)
}

// A token slurmctld does not accept reaches the browser as the reason, not
// as an empty list.
func TestSdashSaysWhenSlurmctldRefusesTheToken(t *testing.T) {
	t.Parallel()
	b := startSdash(t, profileOf(t, `{ env = "SDASH_E2E_TOKEN" }`), "SDASH_E2E_TOKEN=not-a-token")

	resp, err := b.client.Get(b.base + "/clusters/e2e/jobs")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
	var body api.Error
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, api.ErrorCodeUnauthenticated, body.Code)
	assert.NotContains(t, body.Message, "not-a-token")
}
