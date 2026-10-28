// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package client

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"log"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/auth"
	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/releases"
	"github.com/GSI-HPC/sdash/internal/slurm/slurmrestdtest"
	"github.com/GSI-HPC/sdash/internal/slurm/versions"
	"github.com/GSI-HPC/sdash/internal/slurm/wire"
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

// counted is a Source of aliceToken that counts how often it is asked.
type counted struct{ asked atomic.Int32 }

func (c *counted) Token(context.Context) (auth.Token, error) {
	c.asked.Add(1)
	return auth.Parse(aliceToken), nil
}

func newClient(t *testing.T, endpoint string, src auth.Source) *Client {
	t.Helper()
	if src == nil {
		src = auth.Fixed(aliceToken)
	}
	c, err := New(Config{Endpoint: endpoint, Tokens: src, UserAgent: "sdash/test (os/arch)"})
	require.NoError(t, err)
	return c
}

func connect(t *testing.T) (*Conn, *slurmrestdtest.Server) {
	t.Helper()
	fake := slurmrestdtest.New(t, newest())
	conn, err := newClient(t, fake.URL, nil).Connect(t.Context())
	require.NoError(t, err)
	return conn, fake
}

func TestConnectSpeaksTheNewestParserAndKnowsTheRelease(t *testing.T) {
	t.Parallel()
	conn, _ := connect(t)
	assert.Equal(t, newest(), conn.Parser)
	assert.Equal(t, releases.Tested, conn.Fit)
	assert.Equal(t, conn.Release.Line(), conn.Profile.Line())
	assert.True(t, conn.Offers("GET", "/slurm/{v}/jobs/"))
	assert.True(t, conn.Offers("post", "/slurm/{v}/job/submit"))
	assert.False(t, conn.Offers("PUT", "/slurm/{v}/jobs/"))
	assert.False(t, conn.Offers("GET", "/slurm/{v}/no-such-thing/"))
}

func TestTheClientRunsAsTheUserOfTheToken(t *testing.T) {
	t.Parallel()
	fake := slurmrestdtest.New(t, newest())
	c := newClient(t, fake.URL, nil)
	assert.Empty(t, c.User(), "nothing asked yet")
	_, err := c.Connect(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "alice", c.User())
}

// Every request names sdash, carries the token and the user it names, and
// nothing else of the user's (doc/adr/0008-user-agent.md).
func TestEveryRequestCarriesTheUserAgentAndTheToken(t *testing.T) {
	t.Parallel()
	conn, fake := connect(t)
	_, err := conn.Partitions(t.Context())
	require.NoError(t, err)

	requests := fake.Requests()
	require.Len(t, requests, 3, "the document, the ping, the partitions")
	for _, r := range requests {
		assert.Equal(t, "sdash/test (os/arch)", r.Header.Get("User-Agent"), r.URL.Path)
		assert.Equal(t, aliceToken, r.Header.Get("X-SLURM-USER-TOKEN"), r.URL.Path)
		assert.Equal(t, "alice", r.Header.Get("X-SLURM-USER-NAME"), r.URL.Path)
		assert.Empty(t, r.Header.Get("Authorization"), r.URL.Path)
	}
}

func TestJobsStreamsTheSeededJobs(t *testing.T) {
	t.Parallel()
	conn, _ := connect(t)
	var ids []int64
	require.NoError(t, conn.Jobs(t.Context(), func(j *wire.Job) error {
		ids = append(ids, j.JobID)
		return nil
	}))
	slices.Sort(ids)
	assert.Equal(t, []int64{1, 2, 3, 4, 5, 6, 7, 8}, ids)
}

func TestAnErrorOfTheCallerStopsTheListAndComesBackAsItIs(t *testing.T) {
	t.Parallel()
	conn, _ := connect(t)
	full := errors.New("enough")
	err := conn.Jobs(t.Context(), func(*wire.Job) error { return full })
	assert.Same(t, full, err)
}

func TestAJobOrANodeThatDoesNotExistIsNotFound(t *testing.T) {
	t.Parallel()
	conn, _ := connect(t)

	jobs, err := conn.Job(t.Context(), 2)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	assert.Equal(t, []string{"FAILED"}, jobs[0].State)

	_, err = conn.Job(t.Context(), 999999)
	e, ok := errors.AsType[*errs.Error](err)
	require.True(t, ok, "%v", err)
	assert.Equal(t, errs.NotFound, e.Kind)
	assert.Equal(t, errs.NumberInvalidJobID, e.Number)
	assert.Equal(t, http.StatusNotFound, e.Status)
	assert.Equal(t, "Unable to query JobId=999999: Invalid job id specified", e.Message)

	node, err := conn.Node(t.Context(), "worker-2")
	require.NoError(t, err)
	assert.Equal(t, "e2e drained", node.Reason)

	_, err = conn.Node(t.Context(), "nonexistent")
	assert.True(t, errs.Is(err, errs.NotFound), "%v", err)
}

// A malformed and an expired token are told the same way: the ping of
// Connect finds them, and a request after it is refused with them.
func TestATokenSlurmctldRefusesIsUnauthenticated(t *testing.T) {
	t.Parallel()
	for name, token := range map[string]slurmrestdtest.Token{
		"malformed": slurmrestdtest.Malformed,
		"expired":   slurmrestdtest.Expired,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			fake := slurmrestdtest.New(t, newest())
			src := &counted{}
			c := newClient(t, fake.URL, src)

			fake.SetToken(token)
			_, err := c.Connect(t.Context())
			require.True(t, errs.Is(err, errs.Unauthenticated), "%v", err)

			fake.SetToken(slurmrestdtest.Accepted)
			conn, err := c.Connect(t.Context())
			require.NoError(t, err)

			fake.SetToken(token)
			asked := src.asked.Load()
			err = conn.Jobs(t.Context(), func(*wire.Job) error { return nil })
			e, ok := errors.AsType[*errs.Error](err)
			require.True(t, ok, "%v", err)
			assert.Equal(t, errs.Unauthenticated, e.Kind)
			assert.Equal(t, errs.NumberAuthentication, e.Number)

			_, _ = conn.Partitions(t.Context())
			assert.Equal(t, asked+1, src.asked.Load(), "a refused token is not sent again")
		})
	}
}

// expectation is the kind of failure each captured error case stands for.
var expectation = map[string]errs.Kind{
	"unknown-job.json":          errs.NotFound,
	"unknown-node.json":         errs.Rejected, // Node makes it NotFound
	"no-token.json":             errs.Unauthenticated,
	"malformed-token-jobs.json": errs.Unauthenticated,
	"expired-token-jobs.json":   errs.Unauthenticated,
	// slurmrestd cannot tell this from a slurmdbd that is down.
	"malformed-token-qos.json": errs.Unavailable,
	"expired-token-qos.json":   errs.Unavailable,
	// The ping carries no error; Ping tells it.
	"malformed-token-ping.json": -1,
	"expired-token-ping.json":   -1,
}

// TestEveryCapturedErrorCaseIsClassified reads each error case of each
// release with the status it was captured with, through the profile of that
// release: a new case in a capture fails here until it is expected.
func TestEveryCapturedErrorCaseIsClassified(t *testing.T) {
	t.Parallel()
	dirs, err := filepath.Glob(filepath.Join("..", "releases", "testdata", "*", "errors-*"))
	require.NoError(t, err)
	require.NotEmpty(t, dirs)
	for _, dir := range dirs {
		status := readStatus(t, dir)
		profile := profileOf(t, dir, status)
		names := slices.Sorted(maps.Keys(status))
		for _, name := range names {
			t.Run(filepath.Base(filepath.Dir(dir))+" "+name, func(t *testing.T) {
				t.Parallel()
				want, ok := expectation[name]
				require.True(t, ok, "no expectation for this case")
				body, err := os.ReadFile(filepath.Join(dir, name))
				require.NoError(t, err)

				resp := &http.Response{StatusCode: status[name], Body: io.NopCloser(bytes.NewReader(body))}
				var pings wire.Pings
				err = (&Client{}).answer("GET /test", profile, resp, decode(&pings))
				if want < 0 {
					assert.NoError(t, err)
					return
				}
				assert.Equal(t, want, errs.KindOf(err), "%v", err)
			})
		}
	}
}

func readStatus(t *testing.T, dir string) map[string]int {
	t.Helper()
	f, err := os.Open(filepath.Join(dir, "status.tsv"))
	require.NoError(t, err)
	defer func() { _ = f.Close() }()
	status := map[string]int{}
	lines := bufio.NewScanner(f)
	for lines.Scan() {
		code, name, ok := strings.Cut(lines.Text(), "\t")
		require.True(t, ok)
		n, err := strconv.Atoi(code)
		require.NoError(t, err)
		status[name] = n
	}
	return status
}

// profileOf is the profile of the release an error case was captured on,
// as the envelope of one of its answers names it.
func profileOf(t *testing.T, dir string, status map[string]int) releases.Profile {
	t.Helper()
	for name := range status {
		body, err := os.ReadFile(filepath.Join(dir, name))
		require.NoError(t, err)
		var env wire.Envelope
		if json.Unmarshal(body, &env) != nil || env.Meta.Slurm.Release == "" {
			continue
		}
		r, err := releases.Parse(env.Meta.Slurm.Release)
		require.NoError(t, err)
		p, fit := releases.Lookup(r)
		require.Equal(t, releases.Tested, fit)
		return p
	}
	require.FailNow(t, "no answer names its release", dir)
	return releases.Profile{}
}

// serveDocument serves the vendored document of the newest parser, changed
// by edit, and hands every other request to the fake slurmrestd.
func serveDocument(t *testing.T, edit func(info map[string]any)) string {
	t.Helper()
	fake := slurmrestdtest.New(t, newest())
	body, err := os.ReadFile(filepath.Join("..", "versions", newest().Dir(), "openapi.json"))
	require.NoError(t, err)
	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	info, ok := doc["info"].(map[string]any)["x-slurm"].(map[string]any)
	require.True(t, ok)
	edit(info)
	body, err = json.Marshal(doc)
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/openapi/v3" {
			_, _ = w.Write(body)
			return
		}
		fake.Config.Handler.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestAServerWithNoKnownParserIsRefused(t *testing.T) {
	t.Parallel()
	url := serveDocument(t, func(info map[string]any) {
		info["data_parsers"] = []any{map[string]any{"plugin": "v9.9.9"}}
	})
	_, err := newClient(t, url, nil).Connect(t.Context())
	require.ErrorIs(t, err, versions.ErrNoKnownParser)
	assert.True(t, errs.Is(err, errs.Unsupported))
}

// A release newer than any sdash was tested on is reached all the same,
// with the newest profile, and said to be untested.
func TestANewerReleaseGetsTheNewestProfile(t *testing.T) {
	t.Parallel()
	url := serveDocument(t, func(info map[string]any) {
		info["release"] = "99.05.0"
	})
	conn, err := newClient(t, url, nil).Connect(t.Context())
	require.NoError(t, err)
	assert.Equal(t, releases.Newer, conn.Fit)
	assert.Equal(t, "99.05.0", conn.Release.String())
}

// A proxy may serve slurmrestd under a path of its own.
func TestTheEndpointMayHaveABasePath(t *testing.T) {
	t.Parallel()
	fake := slurmrestdtest.New(t, newest())
	srv := httptest.NewServer(http.StripPrefix("/slurmrestd", fake.Config.Handler))
	t.Cleanup(srv.Close)

	conn, err := newClient(t, srv.URL+"/slurmrestd/", nil).Connect(t.Context())
	require.NoError(t, err)
	parts, err := conn.Partitions(t.Context())
	require.NoError(t, err)
	assert.Len(t, parts, 1)
}

// The token travels in a header net/http does not know to drop when a
// redirect leaves the host, so no redirect is followed.
func TestNoRedirectIsFollowed(t *testing.T) {
	t.Parallel()
	var leaked atomic.Bool
	elsewhere := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { leaked.Store(true) }))
	t.Cleanup(elsewhere.Close)
	srv := httptest.NewServer(http.RedirectHandler(elsewhere.URL+"/openapi/v3", http.StatusTemporaryRedirect))
	t.Cleanup(srv.Close)

	_, err := newClient(t, srv.URL, nil).Connect(t.Context())
	require.Error(t, err)
	assert.False(t, leaked.Load(), "the token went to another host")
}

func TestAServerThatCannotBeReachedIsUnavailable(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	_, err := newClient(t, url, nil).Connect(t.Context())
	assert.True(t, errs.Is(err, errs.Unavailable), "%v", err)
}

func TestACancelledRequestReturnsTheContextsError(t *testing.T) {
	t.Parallel()
	fake := slurmrestdtest.New(t, newest())
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := newClient(t, fake.URL, nil).Connect(ctx)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestAnAnswerThatIsNoJSONIsAProtocolFailure(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("<html>a proxy's page</html>"))
	}))
	t.Cleanup(srv.Close)
	_, err := newClient(t, srv.URL, nil).Connect(t.Context())
	assert.True(t, errs.Is(err, errs.Protocol), "%v", err)
}

// A site's own certificate authority is trusted when the profile names it,
// and only then.
func TestTheCAFileIsTrusted(t *testing.T) {
	t.Parallel()
	fake := slurmrestdtest.New(t, newest())
	srv := httptest.NewUnstartedServer(fake.Config.Handler)
	// The handshake that fails on purpose is no news for the test's output.
	srv.Config.ErrorLog = log.New(io.Discard, "", 0)
	srv.StartTLS()
	t.Cleanup(srv.Close)

	_, err := newClient(t, srv.URL, nil).Connect(t.Context())
	require.True(t, errs.Is(err, errs.Unavailable), "an authority nobody named: %v", err)

	ca := filepath.Join(t.TempDir(), "ca.pem")
	require.NoError(t, os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw}), 0o600))
	c, err := New(Config{Endpoint: srv.URL, CAFile: ca, Tokens: auth.Fixed(aliceToken)})
	require.NoError(t, err)
	_, err = c.Connect(t.Context())
	require.NoError(t, err)

	_, err = New(Config{Endpoint: srv.URL, CAFile: filepath.Join(t.TempDir(), "none.pem"), Tokens: auth.Fixed(aliceToken)})
	assert.Error(t, err)
	empty := filepath.Join(t.TempDir(), "empty.pem")
	require.NoError(t, os.WriteFile(empty, []byte("no certificate"), 0o600))
	_, err = New(Config{Endpoint: srv.URL, CAFile: empty, Tokens: auth.Fixed(aliceToken)})
	assert.Error(t, err)
}

func TestNewRefusesAnEndpointItCannotUse(t *testing.T) {
	t.Parallel()
	for name, endpoint := range map[string]string{
		"no scheme":      "slurm.example.org:6820",
		"another scheme": "ftp://slurm.example.org",
		"no host":        "http:///slurm",
		"a password":     "https://alice:secret@slurm.example.org",
		"a query":        "https://slurm.example.org/?x=1",
		"a fragment":     "https://slurm.example.org/#x",
		"no URL":         "http://[::1",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := New(Config{Endpoint: endpoint, Tokens: auth.Fixed(aliceToken)})
			require.Error(t, err)
			assert.NotContains(t, err.Error(), "secret", "the password is not repeated")
		})
	}
	_, err := New(Config{Endpoint: "http://slurm.example.org"})
	assert.Error(t, err, "no source of tokens")
}
