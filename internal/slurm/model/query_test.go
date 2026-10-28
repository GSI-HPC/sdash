// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// queue is a small queue whose jobs differ in each key the tests use.
func queue() []Job {
	return []Job{
		{ID: 1, DisplayID: "1", Name: "train", User: "alice", Partition: "gpu", State: "RUNNING", Priority: ptr[int64](10)},
		{ID: 2, DisplayID: "2", Name: "Analyse", User: "bob", Partition: "main", State: "PENDING", Priority: ptr[int64](30)},
		{ID: 3, DisplayID: "3", Name: "sim", User: "alice", Partition: "main", State: "PENDING"},
		{ID: 4, DisplayID: "4_1", Name: "sweep", User: "carol", Partition: "main", State: "RUNNING", Priority: ptr[int64](20)},
	}
}

func ids(jobs []Job) []int64 {
	out := make([]int64, len(jobs))
	for i, j := range jobs {
		out[i] = j.ID
	}
	return out
}

func TestAJobQueryFiltersByEachOfItsFields(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		q    JobQuery
		want []int64
	}{
		"all":            {JobQuery{}, []int64{1, 2, 3, 4}},
		"states":         {JobQuery{States: []string{"PENDING"}}, []int64{2, 3}},
		"user":           {JobQuery{User: "alice"}, []int64{1, 3}},
		"partition":      {JobQuery{Partition: "main"}, []int64{2, 3, 4}},
		"text in a name": {JobQuery{Text: "ANALY"}, []int64{2}},
		"text in an id":  {JobQuery{Text: "4_1"}, []int64{4}},
		"together":       {JobQuery{User: "alice", States: []string{"PENDING"}}, []int64{3}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			page, err := tc.q.Apply(queue())
			require.NoError(t, err)
			assert.Equal(t, tc.want, ids(page.Rows))
			assert.Equal(t, len(tc.want), page.Total)
		})
	}
}

func TestAJobWithoutTheSortKeyComesLastInEitherOrder(t *testing.T) {
	t.Parallel()
	page, err := JobQuery{Sort: "priority"}.Apply(queue())
	require.NoError(t, err)
	assert.Equal(t, []int64{1, 4, 2, 3}, ids(page.Rows))

	page, err = JobQuery{Sort: "priority", Descending: true}.Apply(queue())
	require.NoError(t, err)
	assert.Equal(t, []int64{2, 4, 1, 3}, ids(page.Rows))
}

func TestTextSortsWithoutRegardToCaseAndTiesBreakByID(t *testing.T) {
	t.Parallel()
	page, err := JobQuery{Sort: "name"}.Apply(queue())
	require.NoError(t, err)
	assert.Equal(t, []int64{2, 3, 4, 1}, ids(page.Rows))

	page, err = JobQuery{Sort: "user", Descending: true}.Apply(queue())
	require.NoError(t, err)
	assert.Equal(t, []int64{4, 2, 1, 3}, ids(page.Rows), "alice's two jobs stay in the order of their ids")
}

func TestTheWindowCutsTheSortedListAndTheTotalCountsItWhole(t *testing.T) {
	t.Parallel()
	page, err := JobQuery{Offset: 1, Limit: 2}.Apply(queue())
	require.NoError(t, err)
	assert.Equal(t, []int64{2, 3}, ids(page.Rows))
	assert.Equal(t, 4, page.Total)

	page, err = JobQuery{Offset: 9}.Apply(queue())
	require.NoError(t, err)
	assert.Empty(t, page.Rows)
	assert.Equal(t, 4, page.Total)
}

func TestFacetsCountTheWholeListTheMostFrequentFirst(t *testing.T) {
	t.Parallel()
	page, err := JobQuery{User: "bob"}.Apply(queue())
	require.NoError(t, err)
	assert.Equal(t, []Facet{{"PENDING", 2}, {"RUNNING", 2}}, page.States)
	assert.Equal(t, []Facet{{"alice", 2}, {"bob", 1}, {"carol", 1}}, page.Users)
	assert.Equal(t, []Facet{{"main", 3}, {"gpu", 1}}, page.Partitions)
}

func TestAJobQueryRefusesAKeyAndAWindowItDoesNotKnow(t *testing.T) {
	t.Parallel()
	_, err := JobQuery{Sort: "colour"}.Apply(queue())
	assert.ErrorContains(t, err, `do not sort by "colour"`)
	_, err = JobQuery{Offset: -1}.Apply(queue())
	assert.Error(t, err)
}

func TestApplyLeavesTheListAsItWas(t *testing.T) {
	t.Parallel()
	jobs := queue()
	_, err := JobQuery{Sort: "name", Descending: true}.Apply(jobs)
	require.NoError(t, err)
	assert.Equal(t, queue(), jobs)
}
