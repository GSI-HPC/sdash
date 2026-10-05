// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package v1alpha1

import "fmt"

// GroupVersion identifies this version of the documents, and is what the
// apiVersion of a document has to say.
const GroupVersion = "sdash/v1alpha1"

// KindCluster is the kind of a cluster profile, the one kind this version
// defines.
const KindCluster = "Cluster"

// CheckAPIVersion says what is wrong with the apiVersion of a document, and
// returns nil for the one this package defines. Both errors name the version
// that was expected, and neither repeats the one that was written: no value
// of a profile is repeated in what sdash reports, and the reader gives the
// place of this one.
//
// Adapted from GSI-HPC/clusterctl internal/apis/v1alpha1/register.go.
func CheckAPIVersion(apiVersion string) error {
	switch apiVersion {
	case GroupVersion:
		return nil
	case "":
		return fmt.Errorf("is missing; this sdash reads %q", GroupVersion)
	default:
		return fmt.Errorf("is not supported; this sdash reads %q", GroupVersion)
	}
}

// CheckKind says what is wrong with the kind of a document of this version,
// and returns nil for a kind this package defines. Both errors name the kind
// that was expected, and neither repeats the one that was written.
//
// Adapted from GSI-HPC/clusterctl internal/apis/v1alpha1/register.go.
func CheckKind(kind string) error {
	switch kind {
	case KindCluster:
		return nil
	case "":
		return fmt.Errorf("is missing; expected %q", KindCluster)
	default:
		return fmt.Errorf("is not a kind this sdash reads; expected %q", KindCluster)
	}
}
