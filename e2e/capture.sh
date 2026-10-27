#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Captures what the slurmrestd of the e2e cluster sends: its OpenAPI document,
# and the answer to every GET without side effects in each data_parser
# version the document lists (doc/adr/0016-e2e-and-fixtures-on-sind.md).
# Usage: capture.sh DIR. The files are the daemon's bytes, one per request;
# DIR/status.tsv has the HTTP status of each.
set -euo pipefail

out=${1:?usage: capture.sh DIR}
export SIND_REALM=${SIND_REALM:-e2e}
mkdir -p "$out"

ip=$(sind get node api -o json | jq -r .ip)
api="http://$ip:6820"
# Root's token, for as long as a capture can take.
token=$(sind exec -- scontrol token username=root lifespan=3600 | cut -d= -f2)

# The status goes to its own file, never into the body: a body with a suffix
# is not the daemon's bytes and is no longer JSON.
get() {
  local path=$1 file=$2 code
  mkdir -p "$(dirname "$out/$file")"
  code=$(curl -sS -m 60 -o "$out/$file" -w '%{http_code}' \
    -H "X-SLURM-USER-NAME: root" -H "X-SLURM-USER-TOKEN: $token" "$api/$path")
  printf '%s\t%s\t%s\n' "$code" "/$path" "$file" >> "$out/status.tsv"
}

: > "$out/status.tsv"
get openapi/v3 openapi.json

# The versions come from the document, so that a release that drops or adds
# one needs no change here.
versions=$(jq -r '.paths | keys[] | capture("^/slurm/(?<v>v[0-9.]+)/ping/$") | .v' "$out/openapi.json" | sort -u)
for v in $versions; do
  for name in ping diag nodes partitions jobs reservations licenses shares; do
    get "slurm/$v/$name/" "slurm/$v/$name.json"
  done
  for name in diag config qos accounts users associations clusters instances tres wckeys jobs; do
    get "slurmdb/$v/$name/" "slurmdb/$v/$name.json"
  done
done
