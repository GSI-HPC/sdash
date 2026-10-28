// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/clusters"
	"github.com/GSI-HPC/sdash/internal/slurm/cache"
	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/model"
)

// The operations on a cluster's data
// (doc/adr/0034-cluster-data-in-the-browser-api.md). They read the caches of
// package clusters and map sdash's model to the shapes of the document; no
// shape of slurmrestd's reaches the browser.

// GetPulse reports the state of a cluster and of the kinds asked for, and
// keeps those kinds watched.
func (o operations) GetPulse(_ context.Context, r api.GetPulseRequestObject) (api.GetPulseResponseObject, error) {
	c, refused := o.cluster(r.Cluster)
	if c == nil {
		return api.GetPulsedefaultJSONResponse(refused), nil
	}
	kinds := []api.DataKind{}
	if r.Params.Kinds != nil {
		kinds = *r.Params.Kinds
	}
	pulse := api.Pulse{Connection: connectionOf(c.State()), Kinds: make([]api.KindPulse, 0, len(kinds))}
	for _, k := range kinds {
		var kp api.KindPulse
		switch k {
		case api.DataKindJobs:
			kp = kindPulse(c.Jobs)
		case api.DataKindNodes:
			kp = kindPulse(c.Nodes)
		case api.DataKindPartitions:
			kp = kindPulse(c.Partitions)
		case api.DataKindReservations:
			kp = kindPulse(c.Reservations)
		default:
			return api.GetPulsedefaultJSONResponse(badRequest(fmt.Sprintf("there is no kind of data %q", k))), nil
		}
		kp.Kind = k
		pulse.Kinds = append(pulse.Kinds, kp)
	}
	return api.GetPulse200JSONResponse(pulse), nil
}

// kindPulse watches the kind of c and says how far its data have got.
func kindPulse[T any](c *cache.Cache[T]) api.KindPulse {
	c.Watch()
	snap := c.Peek()
	kp := api.KindPulse{
		Generation: int64(snap.Generation),
		Period:     int(c.Period() / time.Second),
		Error:      errorOf(snap.Err),
	}
	if snap.Held() {
		kp.FetchedAt = &snap.Fetched
	}
	return kp
}

// GetJobs gives a page of the jobs of a cluster.
func (o operations) GetJobs(ctx context.Context, r api.GetJobsRequestObject) (api.GetJobsResponseObject, error) {
	c, refused := o.cluster(r.Cluster)
	if c == nil {
		return api.GetJobsdefaultJSONResponse(refused), nil
	}
	p := r.Params
	q := model.JobQuery{
		User:       deref(p.User),
		Partition:  deref(p.Partition),
		Text:       deref(p.Q),
		Sort:       string(deref(p.Sort)),
		Descending: deref(p.Order) == api.SortOrderDesc,
		Offset:     deref(p.Offset),
		Limit:      deref(p.Limit),
	}
	if p.State != nil {
		q.States = *p.State
	}
	if p.Order != nil && !p.Order.Valid() {
		return api.GetJobsdefaultJSONResponse(badRequest(fmt.Sprintf("the order is asc or desc, not %q", *p.Order))), nil
	}

	snap, err := c.Jobs.Get(ctx)
	if err != nil {
		return api.GetJobsdefaultJSONResponse(upstream(err)), nil
	}
	page, err := q.Apply(snap.Data)
	if err != nil {
		return api.GetJobsdefaultJSONResponse(badRequest(err.Error())), nil
	}
	list := api.JobList{
		Generation: int64(snap.Generation),
		FetchedAt:  snap.Fetched,
		Error:      errorOf(snap.Err),
		Total:      page.Total,
		Rows:       make([]api.Job, len(page.Rows)),
		Facets: api.JobFacets{
			States:     facetsOf(page.States),
			Users:      facetsOf(page.Users),
			Partitions: facetsOf(page.Partitions),
		},
	}
	for i, j := range page.Rows {
		list.Rows[i] = jobOf(j)
	}
	return api.GetJobs200JSONResponse(list), nil
}

// GetNodes gives the nodes of a cluster.
func (o operations) GetNodes(ctx context.Context, r api.GetNodesRequestObject) (api.GetNodesResponseObject, error) {
	c, refused := o.cluster(r.Cluster)
	if c == nil {
		return api.GetNodesdefaultJSONResponse(refused), nil
	}
	snap, err := c.Nodes.Get(ctx)
	if err != nil {
		return api.GetNodesdefaultJSONResponse(upstream(err)), nil
	}
	list := api.NodeList{
		Generation: int64(snap.Generation),
		FetchedAt:  snap.Fetched,
		Error:      errorOf(snap.Err),
		Rows:       make([]api.Node, len(snap.Data)),
	}
	for i, n := range snap.Data {
		list.Rows[i] = nodeOf(n)
	}
	return api.GetNodes200JSONResponse(list), nil
}

// GetPartitions gives the partitions of a cluster.
func (o operations) GetPartitions(ctx context.Context, r api.GetPartitionsRequestObject) (api.GetPartitionsResponseObject, error) {
	c, refused := o.cluster(r.Cluster)
	if c == nil {
		return api.GetPartitionsdefaultJSONResponse(refused), nil
	}
	snap, err := c.Partitions.Get(ctx)
	if err != nil {
		return api.GetPartitionsdefaultJSONResponse(upstream(err)), nil
	}
	list := api.PartitionList{
		Generation: int64(snap.Generation),
		FetchedAt:  snap.Fetched,
		Error:      errorOf(snap.Err),
		Rows:       make([]api.Partition, len(snap.Data)),
	}
	for i, p := range snap.Data {
		list.Rows[i] = partitionOf(p)
	}
	return api.GetPartitions200JSONResponse(list), nil
}

// GetReservations gives the reservations of a cluster.
func (o operations) GetReservations(ctx context.Context, r api.GetReservationsRequestObject) (api.GetReservationsResponseObject, error) {
	c, refused := o.cluster(r.Cluster)
	if c == nil {
		return api.GetReservationsdefaultJSONResponse(refused), nil
	}
	snap, err := c.Reservations.Get(ctx)
	if err != nil {
		return api.GetReservationsdefaultJSONResponse(upstream(err)), nil
	}
	list := api.ReservationList{
		Generation: int64(snap.Generation),
		FetchedAt:  snap.Fetched,
		Error:      errorOf(snap.Err),
		Rows:       make([]api.Reservation, len(snap.Data)),
	}
	for i, res := range snap.Data {
		list.Rows[i] = reservationOf(res)
	}
	return api.GetReservations200JSONResponse(list), nil
}

// failure is the body and the status of an answer that is not a success,
// as each operation's default answer takes them.
type failure = struct {
	Body       api.Error
	StatusCode int
}

// cluster returns the cluster of the name, or nil and the answer that says
// there is none.
func (o operations) cluster(name string) (*clusters.Cluster, failure) {
	if o.clusters != nil {
		if c, ok := o.clusters.Get(name); ok {
			return c, failure{}
		}
	}
	return nil, failure{
		StatusCode: http.StatusNotFound,
		Body:       api.Error{Code: api.ErrorCodeNotFound, Message: fmt.Sprintf("the profile file names no cluster %q", name)},
	}
}

func badRequest(message string) failure {
	return failure{StatusCode: http.StatusBadRequest, Body: api.Error{Code: api.ErrorCodeBadRequest, Message: message}}
}

// upstream is the answer to a read that has no data to give, because the
// cluster's slurmrestd could not give them.
func upstream(err error) failure {
	return failure{StatusCode: http.StatusBadGateway, Body: *errorOf(err)}
}

// errorOf says why a request to slurmrestd failed, in the Error of the
// document; nil for no failure. The message is the client's, which names
// the request and what slurmrestd said, and never the token.
func errorOf(err error) *api.Error {
	if err == nil {
		return nil
	}
	code := api.ErrorCodeUpstream
	switch errs.KindOf(err) {
	case errs.Unauthenticated:
		code = api.ErrorCodeUnauthenticated
	case errs.Forbidden:
		code = api.ErrorCodeForbidden
	case errs.Unavailable:
		code = api.ErrorCodeUnavailable
	case errs.Unsupported:
		code = api.ErrorCodeUnsupported
	}
	return &api.Error{Code: code, Message: err.Error()}
}

// connectionOf maps the state of a cluster's connection to the document.
func connectionOf(s clusters.State) api.Connection {
	c := api.Connection{Connected: s.Connected, User: optional(s.User), Error: errorOf(s.Err)}
	if s.Connected {
		c.Release = &s.Release
		c.Parser = &s.Parser
		c.Tested = &s.Tested
	}
	return c
}

func facetsOf(list []model.Facet) []api.Facet {
	out := make([]api.Facet, len(list))
	for i, f := range list {
		out[i] = api.Facet{Value: f.Value, Count: f.Count}
	}
	return out
}

func jobOf(j model.Job) api.Job {
	out := api.Job{
		Id:           j.ID,
		DisplayId:    j.DisplayID,
		ArrayJobId:   j.ArrayJobID,
		ArrayTaskId:  j.ArrayTaskID,
		ArrayTasks:   optional(j.ArrayTasks),
		Name:         j.Name,
		User:         j.User,
		Group:        optional(j.Group),
		Account:      j.Account,
		Partition:    j.Partition,
		Qos:          j.QOS,
		State:        j.State,
		Flags:        nonNil(j.Flags),
		Reason:       optional(j.Reason),
		Priority:     j.Priority,
		SubmitTime:   j.Submitted,
		EligibleTime: j.Eligible,
		StartTime:    j.Started,
		EndTime:      j.Ended,
		TimeLimit:    j.TimeLimit,
		Nodes:        optional(j.Nodes),
		NodeCount:    j.NodeCount,
		Cpus:         j.CPUs,
		Reservation:  optional(j.Reservation),
		Dependency:   optional(j.Dependency),
		WorkDir:      optional(j.WorkDir),
		Stdout:       optional(j.StdOut),
		Stderr:       optional(j.StdErr),
	}
	if e := j.ExitCode; e != nil {
		out.ExitCode = &api.ExitCode{Status: e.Status, ReturnCode: e.ReturnCode, Signal: optional(e.Signal)}
	}
	return out
}

func nodeOf(n model.Node) api.Node {
	return api.Node{
		Name:         n.Name,
		State:        n.State,
		Flags:        nonNil(n.Flags),
		Reason:       optional(n.Reason),
		Partitions:   nonNil(n.Partitions),
		Features:     nonNil(n.Features),
		Cpus:         n.CPUs,
		AllocCpus:    n.AllocCPUs,
		Load:         n.Load,
		Memory:       n.Memory,
		AllocMemory:  n.AllocMemory,
		FreeMemory:   n.FreeMemory,
		Gres:         optional(n.GRES),
		GresUsed:     optional(n.GRESUsed),
		Architecture: optional(n.Architecture),
		BootTime:     n.Booted,
		Reservation:  optional(n.Reservation),
	}
}

func partitionOf(p model.Partition) api.Partition {
	return api.Partition{
		Name:         p.Name,
		State:        p.State,
		Nodes:        p.Nodes,
		NodeCount:    p.NodeCount,
		Cpus:         p.CPUs,
		MaxTime:      p.MaxTime,
		DefaultTime:  p.DefaultTime,
		MaxNodes:     p.MaxNodes,
		PriorityTier: p.PriorityTier,
		Qos:          optional(p.QOS),
	}
}

func reservationOf(r model.Reservation) api.Reservation {
	return api.Reservation{
		Name:      r.Name,
		Nodes:     r.Nodes,
		NodeCount: r.NodeCount,
		Cores:     r.Cores,
		StartTime: r.Start,
		EndTime:   r.End,
		Flags:     nonNil(r.Flags),
		Users:     nonNil(r.Users),
		Accounts:  nonNil(r.Accounts),
		Groups:    nonNil(r.Groups),
		Partition: optional(r.Partition),
		Tres:      optional(r.TRES),
		Features:  optional(r.Features),
		Licenses:  optional(r.Licenses),
	}
}

// optional is s, or nil for the empty string: the document leaves a member
// out rather than send it empty.
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// nonNil is list, or an empty one for nil: the document promises a list,
// and a nil slice is sent as null.
func nonNil[T any](list []T) []T {
	if list == nil {
		return []T{}
	}
	return list
}

// deref is what p points to, or the zero value for nil.
func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
