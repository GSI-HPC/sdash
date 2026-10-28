// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/server"
	"github.com/GSI-HPC/sdash/internal/version"
)

// The command line is where the browser API gets what it reports: the
// provenance of this binary and the --read-only flag. The test goes the way
// a browser goes, through the printed address and then to the API with the
// cookie that address gave it.
func TestTheServedStatusDescribesThisBinaryAndItsFlags(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		args     []string
		readOnly bool
	}{
		{name: "by default", args: []string{"--no-browser"}},
		{name: "with --read-only", args: []string{"--no-browser", "--read-only"}, readOnly: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			sdash := runSdash(t, newDesktop(t, nil, nil), tt.args...)
			jar, err := cookiejar.New(nil)
			require.NoError(t, err)
			client := &http.Client{Jar: jar}
			t.Cleanup(client.CloseIdleConnections)

			signedIn, err := client.Get(sdash.address)
			require.NoError(t, err)
			require.NoError(t, signedIn.Body.Close())

			address, err := url.Parse(sdash.address)
			require.NoError(t, err)
			answer, err := client.Get("http://" + address.Host + server.APIPrefix + "/status")
			require.NoError(t, err)
			defer func() { _ = answer.Body.Close() }()
			require.Equal(t, http.StatusOK, answer.StatusCode)
			var status api.Status
			require.NoError(t, json.NewDecoder(answer.Body).Decode(&status))

			build := version.Get()
			assert.Equal(t, build.Version, status.Version)
			assert.Equal(t, build.GoVersion, status.GoVersion)
			assert.Equal(t, build.Platform, status.Platform)
			assert.Equal(t, tt.readOnly, status.ReadOnly)
			assert.Empty(t, status.Clusters)

			// A page reads the CSRF token of its session with the API and
			// sends it back on a request that could change something.
			session, err := client.Get("http://" + address.Host + server.APIPrefix + "/session")
			require.NoError(t, err)
			defer func() { _ = session.Body.Close() }()
			require.Equal(t, http.StatusOK, session.StatusCode)
			var token api.Session
			require.NoError(t, json.NewDecoder(session.Body).Decode(&token))
			require.NotEmpty(t, token.CsrfToken)

			// The mode the status reports is the mode the server keeps:
			// with --read-only a request that could change something is
			// refused for that reason, and without it the request gets as
			// far as the API, which has nothing for it at this address.
			// A browser names the origin of its page on a request that may
			// change something; the client of the standard library does not.
			post, err := http.NewRequestWithContext(t.Context(), http.MethodPost,
				"http://"+address.Host+server.APIPrefix+"/status", nil)
			require.NoError(t, err)
			post.Header.Set("Origin", "http://"+address.Host)
			post.Header.Set("X-Sdash-CSRF", token.CsrfToken)
			changed, err := client.Do(post)
			require.NoError(t, err)
			defer func() { _ = changed.Body.Close() }()
			var refusal api.Error
			require.NoError(t, json.NewDecoder(changed.Body).Decode(&refusal))
			if tt.readOnly {
				assert.Equal(t, http.StatusForbidden, changed.StatusCode)
				assert.Equal(t, api.ErrorCodeReadOnly, refusal.Code)
			} else {
				assert.Equal(t, http.StatusMethodNotAllowed, changed.StatusCode)
				assert.Equal(t, api.ErrorCodeMethodNotAllowed, refusal.Code)
			}

			assert.Equal(t, exitOK, sdash.stop())
		})
	}
}

// The clusters the browser API lists are those of the profile file that
// --config names, and listing them sends nothing to any of them.
func TestTheServedStatusListsTheClustersOfTheProfileFile(t *testing.T) {
	t.Parallel()

	config := filepath.Join(t.TempDir(), "clusters.toml")
	require.NoError(t, os.WriteFile(config, []byte(`
[[cluster]]
name = "virgo"
endpoint = "http://192.0.2.1:6820"
token = { env = "SLURM_JWT" }
`), 0o600))
	sdash := runSdash(t, newDesktop(t, nil, nil), "--no-browser", "--config", config)
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	client := &http.Client{Jar: jar}
	t.Cleanup(client.CloseIdleConnections)
	signedIn, err := client.Get(sdash.address)
	require.NoError(t, err)
	require.NoError(t, signedIn.Body.Close())

	address, err := url.Parse(sdash.address)
	require.NoError(t, err)
	answer, err := client.Get("http://" + address.Host + server.APIPrefix + "/status")
	require.NoError(t, err)
	defer func() { _ = answer.Body.Close() }()
	var status api.Status
	require.NoError(t, json.NewDecoder(answer.Body).Decode(&status))
	assert.Equal(t, []api.Cluster{{Name: "virgo", Endpoint: "http://192.0.2.1:6820"}}, status.Clusters)
}

// A profile file that cannot be used is a mistake of the configuration,
// reported before anything is started, with the exit code of one.
func TestAProfileFileThatCannotBeUsedIsAUsageError(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	for name, tc := range map[string]struct{ text, says string }{
		"missing":        {"", "read the profile file"},
		"not TOML":       {"[[cluster]\n", "profile file"},
		"a bad endpoint": {"[[cluster]]\nname = \"a\"\nendpoint = \"ftp://a\"\ntoken = { env = \"T\" }\n", "scheme is http or https"},
		"a misspelt key": {"[[cluster]]\nname = \"a\"\nendpiont = \"http://a\"\n", "unknown keys"},
		"two tokens":     {"[[cluster]]\nname = \"a\"\nendpoint = \"http://a\"\ntoken = { env = \"T\", file = \"f\" }\n", "exactly one"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			config := filepath.Join(dir, strings.ReplaceAll(name, " ", "-")+".toml")
			if tc.text != "" {
				require.NoError(t, os.WriteFile(config, []byte(tc.text), 0o600))
			}
			stderr := &output{}
			code := runToItsEnd(t, Process{
				Args:   []string{"--no-browser", "--listen", "127.0.0.1:0", "--config", config},
				Stdout: io.Discard,
				Stderr: stderr,
			})
			assert.Equal(t, exitUsage, code)
			assert.Contains(t, stderr.String(), tc.says)
		})
	}
}
