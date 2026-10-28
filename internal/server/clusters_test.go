// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/clusters"
	"github.com/GSI-HPC/sdash/internal/profile"
	"github.com/GSI-HPC/sdash/internal/slurm/model"
	"github.com/GSI-HPC/sdash/internal/slurm/slurmrestdtest"
	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

// aliceToken is a token of the shape scontrol token writes, which names
// alice; the fake slurmrestd does not check it.
var aliceToken = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256"}`)) + "." +
	base64.RawURLEncoding.EncodeToString([]byte(`{"sun":"alice"}`)) + ".c2ln"

// clusterAPI is a router that serves the API with one cluster, virgo, whose
// slurmrestd is a fake that answers with the captures of the seeded sind
// cluster (e2e/seed.sh).
func clusterAPI(t *testing.T) (http.Handler, *slurmrestdtest.Server) {
	t.Helper()
	known := versions.Known()
	fake := slurmrestdtest.New(t, known[len(known)-1])
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	set, err := clusters.New(ctx, profile.Profile{Clusters: []profile.Cluster{{
		Name:     "virgo",
		Endpoint: fake.URL,
		Token:    profile.Token{Env: "SLURM_JWT"},
	}}}, clusters.Options{Getenv: func(string) string { return aliceToken }})
	require.NoError(t, err)
	return testRouter(withAPI(NewAPI(APIConfig{Build: releaseBuild(), Clusters: set}))), fake
}

// ask asks the router for target as a signed-in browser does.
func ask(h http.Handler, target string) *httptest.ResponseRecorder {
	return serve(h, signedIn(request(http.MethodGet, target)))
}

// decodeOK decodes the body of an answer of success into v, refusing a
// member the document does not name.
func decodeOK(t *testing.T, got *httptest.ResponseRecorder, v any) {
	t.Helper()
	require.Equal(t, http.StatusOK, got.Code, got.Body.String())
	decoder := json.NewDecoder(got.Body)
	decoder.DisallowUnknownFields()
	require.NoError(t, decoder.Decode(v))
}

func TestTheStatusListsTheClustersOfTheProfile(t *testing.T) {
	t.Parallel()
	h, fake := clusterAPI(t)
	var status api.Status
	decodeOK(t, ask(h, "/api/v1/status"), &status)
	assert.Equal(t, []api.Cluster{{Name: "virgo", Endpoint: fake.URL}}, status.Clusters)
	assert.Empty(t, fake.Requests(), "listing a cluster asks it nothing")
}

func TestAClusterTheProfileDoesNotNameIsNotFound(t *testing.T) {
	t.Parallel()
	h, _ := clusterAPI(t)
	for _, path := range []string{"pulse", "jobs", "nodes", "partitions"} {
		got := ask(h, "/api/v1/clusters/lyra/"+path)
		assert.Equal(t, http.StatusNotFound, got.Code, path)
		assert.Equal(t, api.ErrorCodeNotFound, apiError(t, got).Code, path)
	}
}

func TestTheJobsAreFilteredSortedAndCutOnTheServer(t *testing.T) {
	t.Parallel()
	h, _ := clusterAPI(t)
	var list api.JobList
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/jobs?state=PENDING&sort=id&order=desc&limit=2"), &list)

	assert.Equal(t, 3, list.Total, "jobs 6, 7 and 8 are pending")
	require.Len(t, list.Rows, 2)
	assert.Equal(t, "8_[1-3]", list.Rows[0].DisplayId)
	assert.Equal(t, int64(7), list.Rows[1].Id)
	assert.Equal(t, int64(1), list.Generation)
	assert.False(t, list.FetchedAt.IsZero())
	assert.Nil(t, list.Error)
	assert.Contains(t, list.Facets.States, api.Facet{Value: "RUNNING", Count: 2})
	assert.Contains(t, list.Facets.Users, api.Facet{Value: "bob", Count: 2})
}

// A member slurmctld leaves unset is absent, never null and never an empty
// string, as the document says.
func TestAJobLeavesOutWhatItLacks(t *testing.T) {
	t.Parallel()
	h, _ := clusterAPI(t)
	got := ask(h, "/api/v1/clusters/virgo/jobs?q=running-a")
	require.Equal(t, http.StatusOK, got.Code)
	rows := members(t, got.Body.String())["rows"].([]any)
	require.Len(t, rows, 1)
	job := rows[0].(map[string]any)
	assert.Equal(t, "RUNNING", job["state"])
	assert.Equal(t, []any{}, job["flags"])
	for _, absent := range []string{"reason", "exitCode", "timeLimit", "arrayJobId"} {
		assert.NotContains(t, job, absent)
	}

	var failed api.JobList
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/jobs?q=fails"), &failed)
	require.Len(t, failed.Rows, 1)
	require.NotNil(t, failed.Rows[0].ExitCode)
	assert.Equal(t, "ERROR", failed.Rows[0].ExitCode.Status)
	assert.Equal(t, int64(3), *failed.Rows[0].ExitCode.ReturnCode)
}

func TestAJobQueryTheServerCannotAnswerIsABadRequest(t *testing.T) {
	t.Parallel()
	h, _ := clusterAPI(t)
	for _, query := range []string{"sort=colour", "order=up", "offset=-1", "limit=many"} {
		got := ask(h, "/api/v1/clusters/virgo/jobs?"+query)
		assert.Equal(t, http.StatusBadRequest, got.Code, query)
		assert.Equal(t, api.ErrorCodeBadRequest, apiError(t, got).Code, query)
	}
}

// The document and the model name the same sort keys.
func TestTheJobsSortByTheKeysTheDocumentNames(t *testing.T) {
	t.Parallel()
	var keys []string
	for _, k := range []api.JobSortKey{
		api.JobSortKeyAccount, api.JobSortKeyCpus, api.JobSortKeyEnded, api.JobSortKeyId, api.JobSortKeyName,
		api.JobSortKeyNodes, api.JobSortKeyPartition, api.JobSortKeyPriority, api.JobSortKeyReason,
		api.JobSortKeyStarted, api.JobSortKeyState, api.JobSortKeySubmitted, api.JobSortKeyTimeLimit,
		api.JobSortKeyUser,
	} {
		keys = append(keys, string(k))
	}
	slices.Sort(keys)
	assert.Equal(t, model.SortKeys(), keys)
}

func TestTheNodesAndPartitionsComeWhole(t *testing.T) {
	t.Parallel()
	h, _ := clusterAPI(t)
	var nodes api.NodeList
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/nodes"), &nodes)
	require.Len(t, nodes.Rows, 3)
	drained := nodes.Rows[2]
	assert.Equal(t, "worker-2", drained.Name)
	assert.Equal(t, "IDLE", drained.State)
	assert.Equal(t, []string{"DRAIN"}, drained.Flags)
	assert.Equal(t, "e2e drained", *drained.Reason)

	var parts api.PartitionList
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/partitions"), &parts)
	require.Len(t, parts.Rows, 1)
	assert.Equal(t, "worker-[0-2]", parts.Rows[0].Nodes)
	assert.Nil(t, parts.Rows[0].MaxTime, "the seeded partition has no limit")
}

func TestThePulseReportsTheConnectionAndHowFarEachKindHasGot(t *testing.T) {
	t.Parallel()
	h, _ := clusterAPI(t)

	var before api.Pulse
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/pulse"), &before)
	assert.False(t, before.Connection.Connected)
	assert.Empty(t, before.Kinds)

	decodeOK(t, ask(h, "/api/v1/clusters/virgo/nodes"), &api.NodeList{})
	var after api.Pulse
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/pulse?kinds=nodes&kinds=jobs"), &after)
	assert.True(t, after.Connection.Connected)
	assert.Equal(t, "alice", *after.Connection.User)
	assert.True(t, *after.Connection.Tested)
	assert.NotEmpty(t, *after.Connection.Release)
	require.Len(t, after.Kinds, 2)
	assert.Equal(t, api.DataKindNodes, after.Kinds[0].Kind)
	assert.Equal(t, int64(1), after.Kinds[0].Generation)
	assert.NotNil(t, after.Kinds[0].FetchedAt)
	assert.Equal(t, int(clusters.NodesInterval.Seconds()), after.Kinds[0].Period)
	assert.Equal(t, api.DataKindJobs, after.Kinds[1].Kind)

	got := ask(h, "/api/v1/clusters/virgo/pulse?kinds=reservations")
	assert.Equal(t, http.StatusBadRequest, got.Code)
}

func TestAReadSlurmrestdRefusesIsABadGatewayThatSaysWhy(t *testing.T) {
	t.Parallel()
	h, fake := clusterAPI(t)
	fake.SetToken(slurmrestdtest.Expired)

	got := ask(h, "/api/v1/clusters/virgo/jobs")
	assert.Equal(t, http.StatusBadGateway, got.Code)
	body := apiError(t, got)
	assert.Equal(t, api.ErrorCodeUnauthenticated, body.Code)
	assert.NotContains(t, body.Message, aliceToken)

	var pulse api.Pulse
	decodeOK(t, ask(h, "/api/v1/clusters/virgo/pulse?kinds=jobs"), &pulse)
	require.NotNil(t, pulse.Connection.Error)
	assert.Equal(t, api.ErrorCodeUnauthenticated, pulse.Connection.Error.Code)
	require.NotNil(t, pulse.Kinds[0].Error)
	assert.Equal(t, int64(0), pulse.Kinds[0].Generation)
}
