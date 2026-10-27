#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Copies a capture of capture.sh into the tree: for each data_parser version
# its own OpenAPI document and the captured answers, as the layout of
# doc/adr/0005-versions-releases-and-capabilities.md keeps them, and the
# error cases under the Slurm release they were captured on. Run it on a
# capture that CI kept as an artifact (doc/adr/0016-e2e-and-fixtures-on-sind.md),
# and commit the result by itself.
# Usage: vendor.sh CAPTURE VERSION...   (VERSION as slurmrestd names it, v0.0.45)
set -euo pipefail

capture=${1:?usage: vendor.sh CAPTURE VERSION...}
shift
[ $# -gt 0 ] || { echo "usage: vendor.sh CAPTURE VERSION..." >&2; exit 2; }

root=$(cd "$(dirname "$0")/.." && pwd)
# r2605 for 26.05.5: the directory of a release holds what is observed of it.
release=$(jq -r '.info["x-slurm"].version | "r" + .major + .minor' "$capture/openapi.json")

for v in "$@"; do
  [ -f "$capture/spec/$v.json" ] || { echo "the capture has no document for $v" >&2; exit 1; }
  # v0.0.45 is the directory v0045.
  versions="$root/internal/slurm/versions/${v//./}"
  releases="$root/internal/slurm/releases/testdata/$release/errors-${v//./}"
  rm -rf "$versions" "$releases"
  mkdir -p "$versions/testdata" "$releases"

  cp "$capture/spec/$v.json" "$versions/openapi.json"
  cp "$capture/provenance.txt" "$versions/testdata/provenance.txt"
  for api in slurm slurmdb; do
    for f in "$capture/$api/$v"/*.json; do
      cp "$f" "$versions/testdata/$api-$(basename "$f")"
    done
  done
  cp "$capture/errors/$v"/* "$releases/"
done
