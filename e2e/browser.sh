#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Runs the views of bin/sdash in a browser against the slurmrestd of the
# seeded e2e cluster (web/e2e/sind), and leaves a screenshot of each in
# web/test-results/sind/screenshots/ (doc/adr/0016-e2e-and-fixtures-on-sind.md).
# The profile file names the cluster "e2e", with a token that slurmctld mints
# for alice, through the token command a login node would have.
# Usage: browser.sh [PLAYWRIGHT_ARG...]
set -euo pipefail

export SIND_REALM=${SIND_REALM:-e2e}

ip=$(sind get node api -o json | jq -r .ip)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
cat > "$dir/clusters.toml" <<TOML
[[cluster]]
name = "e2e"
endpoint = "http://$ip:6820"
token = { command = ["sind", "exec", "--", "scontrol", "token", "username=alice", "lifespan=3600"] }
TOML

cd "$(dirname "$0")/../web"
SDASH_PROFILE="$dir/clusters.toml" npx playwright test --config playwright.sind.config.ts "$@"
