// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package model

import (
	"cmp"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"
)

// JobQuery says which jobs of a list to give, in which order, and which
// window of them: the browser asks for a page of a list it does not hold
// whole (doc/adr/0010-read-through-cache-and-polling.md).
type JobQuery struct {
	// States keeps the jobs in one of these base states; empty for all.
	States []string
	// User keeps the jobs of this user; empty for all.
	User string
	// Partition keeps the jobs of this partition; empty for all.
	Partition string
	// Text keeps the jobs whose id, name, user or account contains it,
	// whatever the case; empty for all.
	Text string
	// Sort is the key to sort by, one of SortKeys; empty for the id.
	Sort string
	// Descending reverses the order. A job that lacks the key comes last
	// either way.
	Descending bool
	// Offset is how many of the sorted jobs to skip, Limit how many to give
	// at most; 0 for all that are left.
	Offset, Limit int
}

// Facet is a value of a field and how many jobs have it.
type Facet struct {
	Value string
	Count int
}

// JobPage is what a JobQuery gives.
type JobPage struct {
	// Total is how many jobs the filters keep, before the window.
	Total int
	// Rows are the jobs of the window.
	Rows []Job
	// States, Users and Partitions count the jobs of the whole list by
	// each value, for the filters to offer, the most frequent first.
	States, Users, Partitions []Facet
}

// jobKeys are the keys a list of jobs sorts by, and how each compares two
// jobs; ok is false for a job that lacks the key.
var jobKeys = map[string]func(a, b Job) (int, bool){
	"id":        func(a, b Job) (int, bool) { return cmp.Compare(a.ID, b.ID), true },
	"name":      text(func(j Job) string { return j.Name }),
	"user":      text(func(j Job) string { return j.User }),
	"account":   text(func(j Job) string { return j.Account }),
	"partition": text(func(j Job) string { return j.Partition }),
	"state":     text(func(j Job) string { return j.State }),
	"reason":    text(func(j Job) string { return j.Reason }),
	"priority":  number(func(j Job) *int64 { return j.Priority }),
	"cpus":      number(func(j Job) *int64 { return j.CPUs }),
	"nodes":     number(func(j Job) *int64 { return j.NodeCount }),
	"timeLimit": number(func(j Job) *int64 { return j.TimeLimit }),
	"submitted": moments(func(j Job) *time.Time { return j.Submitted }),
	"started":   moments(func(j Job) *time.Time { return j.Started }),
	"ended":     moments(func(j Job) *time.Time { return j.Ended }),
}

// SortKeys are the keys a list of jobs sorts by.
func SortKeys() []string {
	return slices.Sorted(maps.Keys(jobKeys))
}

// Apply gives the page of jobs the query asks for. The jobs are not changed.
func (q JobQuery) Apply(jobs []Job) (JobPage, error) {
	key := cmp.Or(q.Sort, "id")
	compare, ok := jobKeys[key]
	if !ok {
		return JobPage{}, fmt.Errorf("jobs do not sort by %q; they sort by %s", key, strings.Join(SortKeys(), ", "))
	}
	if q.Offset < 0 || q.Limit < 0 {
		return JobPage{}, fmt.Errorf("the offset and the limit are 0 or more")
	}

	page := JobPage{
		States:     facets(jobs, func(j Job) string { return j.State }),
		Users:      facets(jobs, func(j Job) string { return j.User }),
		Partitions: facets(jobs, func(j Job) string { return j.Partition }),
	}
	text := strings.ToLower(q.Text)
	kept := make([]Job, 0, len(jobs))
	for _, j := range jobs {
		switch {
		case len(q.States) > 0 && !slices.Contains(q.States, j.State),
			q.User != "" && j.User != q.User,
			q.Partition != "" && j.Partition != q.Partition,
			text != "" && !matches(j, text):
			continue
		}
		kept = append(kept, j)
	}

	slices.SortStableFunc(kept, func(a, b Job) int {
		c, aHas := compare(a, b)
		_, bHas := compare(b, a)
		switch {
		case aHas && !bHas:
			return -1
		case !aHas && bHas:
			return 1
		case !aHas && !bHas:
			c = 0
		case q.Descending:
			c = -c
		}
		// The id breaks a tie, so that a page boundary does not move
		// between two reads of the same list.
		return cmp.Or(c, cmp.Compare(a.ID, b.ID))
	})

	page.Total = len(kept)
	start := min(q.Offset, len(kept))
	end := len(kept)
	if q.Limit > 0 {
		end = min(start+q.Limit, len(kept))
	}
	page.Rows = kept[start:end]
	return page, nil
}

// matches tells whether the id, the name, the user or the account of j
// contains text, which is in lower case.
func matches(j Job, text string) bool {
	for _, s := range []string{j.DisplayID, j.Name, j.User, j.Account} {
		if strings.Contains(strings.ToLower(s), text) {
			return true
		}
	}
	return false
}

// facets counts the jobs by the value of a field, the most frequent first
// and then by the value; an empty value is not counted.
func facets(jobs []Job, field func(Job) string) []Facet {
	counts := map[string]int{}
	for _, j := range jobs {
		if v := field(j); v != "" {
			counts[v]++
		}
	}
	list := make([]Facet, 0, len(counts))
	for v, n := range counts {
		list = append(list, Facet{Value: v, Count: n})
	}
	slices.SortFunc(list, func(a, b Facet) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(a.Value, b.Value))
	})
	return list
}

// text compares a field of text; an empty one is lacking.
func text(field func(Job) string) func(a, b Job) (int, bool) {
	return func(a, b Job) (int, bool) {
		x, y := field(a), field(b)
		return cmp.Compare(strings.ToLower(x), strings.ToLower(y)), x != ""
	}
}

// number compares a number that may be unset.
func number(field func(Job) *int64) func(a, b Job) (int, bool) {
	return func(a, b Job) (int, bool) {
		x, y := field(a), field(b)
		if x == nil || y == nil {
			return 0, x != nil
		}
		return cmp.Compare(*x, *y), true
	}
}

// moments compares a point in time that may be unset.
func moments(field func(Job) *time.Time) func(a, b Job) (int, bool) {
	return func(a, b Job) (int, bool) {
		x, y := field(a), field(b)
		if x == nil || y == nil {
			return 0, x != nil
		}
		return x.Compare(*y), true
	}
}
