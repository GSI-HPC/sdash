// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package slurmrestdtest

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

func get(t *testing.T, s *Server, path, token string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, s.URL+path, nil)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("X-SLURM-USER-TOKEN", token)
	}
	resp, err := s.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, string(body)
}

func TestTheFakeAnswersWithTheCaptures(t *testing.T) {
	t.Parallel()
	for _, p := range versions.Known() {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			s := New(t, p)
			v := "/" + string(p) + "/"

			status, body := get(t, s, "/openapi/v3", "x")
			assert.Equal(t, http.StatusOK, status)
			assert.Contains(t, body, `"x-slurm"`)

			for path, want := range map[string]string{
				"/slurm" + v + "jobs/":         `"jobs"`,
				"/slurm" + v + "job/2":         `"FAILED"`,
				"/slurm" + v + "node/worker-2": `"e2e drained"`,
				"/slurmdb" + v + "user/alice":  `"alice"`,
				"/slurm" + v + "partition/all": `"partitions"`,
			} {
				status, body := get(t, s, path, "x")
				assert.Equal(t, http.StatusOK, status, path)
				assert.Contains(t, body, want, path)
			}

			status, _ = get(t, s, "/slurm"+v+"job/999999", "x")
			assert.Equal(t, http.StatusNotFound, status, "as slurmrestd answers a job it does not know")
			status, _ = get(t, s, "/slurm"+v+"no-such-thing/", "x")
			assert.Equal(t, http.StatusNotFound, status)
			// A name is looked up among the captures, never opened.
			status, _ = get(t, s, "/slurmdb"+v+"user/..%2F..%2F..%2Fversions", "x")
			assert.Equal(t, http.StatusNotFound, status)
		})
	}
}

func TestTheFakeRefusesARequestWithoutAToken(t *testing.T) {
	t.Parallel()
	s := New(t, versions.Known()[0])
	status, body := get(t, s, "/openapi/v3", "")
	assert.Equal(t, http.StatusUnauthorized, status)
	assert.Equal(t, "Authentication failure", strings.TrimSpace(body))
}

func TestTheFakeAnswersABadTokenAsSlurmrestdDid(t *testing.T) {
	t.Parallel()
	p := versions.Known()[0]
	s := New(t, p)
	s.SetToken(Expired)
	v := "/" + string(p) + "/"

	status, body := get(t, s, "/slurm"+v+"ping/", "x")
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, body, "Protocol authentication error")
	status, _ = get(t, s, "/slurm"+v+"nodes/", "x")
	assert.Equal(t, http.StatusNetworkAuthenticationRequired, status)
	status, _ = get(t, s, "/slurmdb"+v+"users/", "x")
	assert.Equal(t, http.StatusBadGateway, status)

	assert.Len(t, s.Requests(), 3)
}
