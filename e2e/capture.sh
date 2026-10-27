#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Captures what the slurmrestd of the e2e cluster sends, after seed.sh: its
# OpenAPI document, the answer to every GET without side effects in each
# data_parser version the document lists, a few answers by name, and the
# error cases (doc/adr/0016-e2e-and-fixtures-on-sind.md).
# Usage: capture.sh DIR. The files are the daemon's bytes, one per request;
# DIR/status.tsv has the HTTP status of each.
set -euo pipefail

out=${1:?usage: capture.sh DIR}
export SIND_REALM=${SIND_REALM:-e2e}
mkdir -p "$out"

ip=$(sind get node api -o json | jq -r .ip)
api="http://$ip:6820"
# A token of slurmctld for USER, for as long as a capture can take.
token() {
  sind exec -- scontrol token "username=$1" "lifespan=${2:-3600}" | cut -d= -f2
}
root_token=$(token root)

# get FILE PATH [CURL_ARG...]: the status goes to status.tsv and never into
# the body, since a body with a suffix is not the daemon's bytes and no longer
# JSON. A request is root's unless the arguments say otherwise.
get() {
  local file=$1 path=$2 code
  shift 2
  mkdir -p "$(dirname "$out/$file")"
  code=$(curl -sS -m 60 -o "$out/$file" -w '%{http_code}' "$@" "$api/$path")
  printf '%s\t/%s\t%s\n' "$code" "$path" "$file" >> "$out/status.tsv"
}
as_user() {
  get "$1" "$2" -H "X-SLURM-USER-NAME: $3" -H "X-SLURM-USER-TOKEN: $4"
}
as_root() {
  as_user "$1" "$2" root "$root_token"
}

: > "$out/status.tsv"
as_root openapi.json openapi/v3

# Where the capture comes from, for whoever reads a fixture later.
{
  sind version | head -n 1
  jq -r '.info."x-slurm".release | "slurm " + .' "$out/openapi.json"
} > "$out/provenance.txt"

# The versions come from the document, so that a release that drops or adds
# one needs no change here.
versions=$(jq -r '.paths | keys[] | capture("^/slurm/(?<v>v[0-9.]+)/ping/$") | .v' "$out/openapi.json" | sort -u)
container=$(sind get node api -o json | jq -r .container)
for v in $versions; do
  # The document of this version alone, which the daemon writes offline. The
  # one served at /openapi/v3 holds every version it has loaded.
  mkdir -p "$out/spec"
  docker exec "$container" slurmrestd -f /dev/null --generate-openapi-spec \
    -s slurmctld,slurmdbd -d "$v" > "$out/spec/$v.json"

  for name in ping diag nodes partitions jobs reservations licenses shares; do
    as_root "slurm/$v/$name.json" "slurm/$v/$name/"
  done
  for name in diag config qos accounts users associations clusters instances tres wckeys jobs; do
    as_root "slurmdb/$v/$name.json" "slurmdb/$v/$name/"
  done

  # By name: the ids and names are those of seed.sh and of the cluster file.
  partition=$(jq -r '.partitions[0].name' "$out/slurm/$v/partitions.json")
  as_root "slurm/$v/node-worker-0.json" "slurm/$v/node/worker-0"
  as_root "slurm/$v/node-worker-2-drained.json" "slurm/$v/node/worker-2"
  as_root "slurm/$v/partition.json" "slurm/$v/partition/$partition"
  as_root "slurm/$v/reservation.json" "slurm/$v/reservation/maintenance"
  for id in 1 2 3 4 5 6 7 8; do
    as_root "slurm/$v/job-$id.json" "slurm/$v/job/$id"
  done
  as_root "slurmdb/$v/job-1.json" "slurmdb/$v/job/1"
  as_root "slurmdb/$v/user-alice.json" "slurmdb/$v/user/alice"

  # The same list as another user sees it: the token of alice carries her
  # name, and slurmctld looks her up.
  as_user "slurm/$v/jobs-as-alice.json" "slurm/$v/jobs/" alice "$(token alice)"

  # The error cases.
  as_root "errors/$v/unknown-job.json" "slurm/$v/job/999999"
  as_root "errors/$v/unknown-node.json" "slurm/$v/node/nonexistent"
  get "errors/$v/no-token.json" "slurm/$v/ping/"
  get "errors/$v/malformed-token.json" "slurm/$v/ping/" \
    -H "X-SLURM-USER-NAME: root" -H "X-SLURM-USER-TOKEN: not-a-token"

  # A user the cluster does not have, if slurmctld mints a token for one.
  # Reading is not refused to a name slurmctld has never heard of.
  if ghost=$(token ghost 2>/dev/null); then
    as_user "slurm/$v/jobs-as-unknown-user.json" "slurm/$v/jobs/" ghost "$ghost"
  else
    echo "slurmctld mints no token for an unknown user: no capture of one" >&2
  fi
done

# A token that has expired, which can only be told after its lifespan.
expired=$(token root 1)
sleep 3
v=$(echo "$versions" | tail -n 1)
as_user "errors/$v/expired-token.json" "slurm/$v/ping/" root "$expired"
