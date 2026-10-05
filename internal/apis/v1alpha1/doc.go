// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package v1alpha1 defines the configuration documents sdash reads. There
// is one kind, Cluster: the profile of one Slurm cluster, which says where
// its slurmrestd is, how to reach it and where the token comes from
// (doc/adr/0025-cluster-profiles-as-yaml-documents.md).
//
// A document is YAML and carries an apiVersion and a kind, as the documents
// of clusterctl do, so that several of them may share a file and a later
// version of sdash can tell what it is reading. The types live apart from
// the code that reads them (internal/config) so that a second version can
// stand beside this one.
//
// The names in the yaml tags are the keys of a document. They are what the
// reader matches a key against, and what it suggests when a key is close to
// one of them.
//
// # Compatibility
//
// v1alpha1 promises nothing. The apiVersion is checked when a document is
// read, so a file written for another version is reported and not misread.
//
// Adapted from GSI-HPC/clusterctl internal/apis/v1alpha1/doc.go.
package v1alpha1
