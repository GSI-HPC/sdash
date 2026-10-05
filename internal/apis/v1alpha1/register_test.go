// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package v1alpha1

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A file written for another program or another version must be reported
// and not misread, and the report has to say what this sdash reads: the
// user who copied a document from clusterctl sees at once which line to
// change. What was written is not repeated, as no value of a profile is in
// what sdash reports.
func TestOnlyTheVersionOfThisPackageIsAccepted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		apiVersion string
		says       string
	}{
		{name: "this version", apiVersion: "sdash/v1alpha1"},
		{name: "no version", apiVersion: "", says: `is missing; this sdash reads "sdash/v1alpha1"`},
		{name: "a later version", apiVersion: "sdash/v1", says: `is not supported; this sdash reads "sdash/v1alpha1"`},
		{name: "the sibling's version", apiVersion: "clusterctl/v1alpha1", says: `is not supported; this sdash reads "sdash/v1alpha1"`},
		{name: "the version without its group", apiVersion: "v1alpha1", says: `is not supported; this sdash reads "sdash/v1alpha1"`},
		{name: "another case", apiVersion: "SDASH/V1ALPHA1", says: `is not supported; this sdash reads "sdash/v1alpha1"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := CheckAPIVersion(tt.apiVersion)

			if tt.says == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Equal(t, tt.says, err.Error())
		})
	}
}

func TestOnlyTheKindClusterIsAccepted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		kind string
		says string
	}{
		{name: "a cluster", kind: "Cluster"},
		{name: "no kind", kind: "", says: `is missing; expected "Cluster"`},
		{name: "a kind of the sibling", kind: "Site", says: `is not a kind this sdash reads; expected "Cluster"`},
		{name: "another case", kind: "cluster", says: `is not a kind this sdash reads; expected "Cluster"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := CheckKind(tt.kind)

			if tt.says == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Equal(t, tt.says, err.Error())
		})
	}
}
