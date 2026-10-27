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
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
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

	// scontrol prints SLURM_JWT=<token>.
	_, token, found := strings.Cut(strings.TrimSpace(string(sind(t, "exec", "--", "scontrol", "token", "username=root", "lifespan=600"))), "=")
	require.True(t, found, "scontrol token printed no SLURM_JWT=<token>")

	return slurmrestd{base: fmt.Sprintf("http://%s:6820", node.IP), token: token}
}

// get returns the status and the body of a GET with root's token.
func (s slurmrestd) get(t *testing.T, path string) (int, []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+path, nil)
	require.NoError(t, err)
	req.Header.Set("X-SLURM-USER-NAME", "root")
	req.Header.Set("X-SLURM-USER-TOKEN", s.token)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }() // a read-only response: the close cannot lose data

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, body
}

func TestSlurmrestdAnswersPingToARootToken(t *testing.T) {
	t.Parallel()
	s := newSlurmrestd(t)

	status, body := s.get(t, "/openapi/v3")
	require.Equal(t, http.StatusOK, status)
	var spec struct {
		Paths map[string]json.RawMessage `json:"paths"`
	}
	require.NoError(t, json.Unmarshal(body, &spec))

	// The document names the versions the daemon serves, and any of them
	// answers; which one is not this test's business.
	var ping string
	for p := range spec.Paths {
		if strings.HasPrefix(p, "/slurm/v") && strings.HasSuffix(p, "/ping/") {
			ping = p
			break
		}
	}
	require.NotEmpty(t, ping, "the OpenAPI document has no ping path")

	status, body = s.get(t, ping)
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
