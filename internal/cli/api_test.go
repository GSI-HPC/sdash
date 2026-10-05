// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/exitcode"
	"github.com/GSI-HPC/sdash/internal/server"
	"github.com/GSI-HPC/sdash/internal/version"
)

// signedIn returns a client that has opened the printed address of a
// running sdash, as a browser does, and so holds its cookie, and the
// address of the browser API of that sdash.
func signedIn(t *testing.T, sdash *launched) (*http.Client, string) {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	client := &http.Client{Jar: jar}
	t.Cleanup(client.CloseIdleConnections)

	opened, err := client.Get(sdash.address)
	require.NoError(t, err)
	require.NoError(t, opened.Body.Close())

	address, err := url.Parse(sdash.address)
	require.NoError(t, err)
	return client, "http://" + address.Host + server.APIPrefix
}

// statusFrom asks the browser API at the address browserAPI for its status,
// with a client that is signed in.
func statusFrom(t *testing.T, client *http.Client, browserAPI string) api.Status {
	t.Helper()
	answer, err := client.Get(browserAPI + "/status")
	require.NoError(t, err)
	defer func() { _ = answer.Body.Close() }()
	require.Equal(t, http.StatusOK, answer.StatusCode)
	var status api.Status
	require.NoError(t, json.NewDecoder(answer.Body).Decode(&status))
	return status
}

// servedStatus asks a running sdash for its status the way a browser goes:
// through the printed address, and then to the API with the cookie that
// address gave it.
func servedStatus(t *testing.T, sdash *launched) api.Status {
	t.Helper()
	client, browserAPI := signedIn(t, sdash)
	return statusFrom(t, client, browserAPI)
}

// The command line is where the browser API gets what it reports: the
// provenance of this binary and the --read-only flag.
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

			sdash := launch(t, newDesktop(t, nil, nil), tt.args...)

			client, browserAPI := signedIn(t, sdash)
			status := statusFrom(t, client, browserAPI)

			build := version.Get()
			assert.Equal(t, build.Version, status.Version)
			assert.Equal(t, build.GoVersion, status.GoVersion)
			assert.Equal(t, build.Platform, status.Platform)
			assert.Equal(t, tt.readOnly, status.ReadOnly)
			assert.Empty(t, status.Clusters)

			// The mode the status reports is the mode the server keeps:
			// with --read-only a request that could change something is
			// refused for that reason, and without it the request gets as
			// far as the API, which has nothing for it at this address.
			changed, err := client.Post(browserAPI+"/status", "application/json", nil)
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

			assert.Equal(t, exitcode.OK, sdash.stop())
		})
	}
}
