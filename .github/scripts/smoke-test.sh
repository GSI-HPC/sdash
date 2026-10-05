#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Smoke test of a built sdash: the binary has to work, not only compile, and
# it has to hold the user interface. "go build" alone embeds a placeholder and
# gives a binary that answers every page with 404
# (doc/adr/0001-local-first-binary-with-embedded-ui.md); a release of that
# binary would install and show nothing, so CI runs this on every change and
# the release build runs it before anything is published.
#
# Needs curl. Give it the binary:
#
#   .github/scripts/smoke-test.sh bin/sdash

set -euo pipefail

bin="${1:?the sdash binary to test}"

work="$(mktemp -d)"
pid=""
cleanup() {
  if [ -n "$pid" ]; then
    kill -KILL "$pid" 2> /dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "::error::smoke test: $*"
  if [ -s "$work/stderr" ]; then
    sed 's/^/    /' "$work/stderr"
  fi
  exit 1
}

# request <curl arguments...> makes one request, which may take ten seconds
# and no longer, so that a server that hangs fails the test and does not
# hold it up.
request() {
  curl --silent --show-error --max-time 10 "$@"
}

# status <curl arguments...> prints the HTTP status of one request.
status() {
  request --output /dev/null --write-out '%{http_code}' "$@"
}

# running says whether sdash is still there.
running() {
  kill -0 "$pid" 2> /dev/null
}

"$bin" version
"$bin" version --json | grep -q '"version"' ||
  fail "version --json names no version"

# localhost binds both loopback addresses, as sdash does by default. Port 0
# has the system pick a free port, so the test collides with nothing that
# runs beside it. No browser is opened: curl stands in for it.
"$bin" --no-browser --listen localhost:0 > "$work/stdout" 2> "$work/stderr" &
pid=$!

# sdash is up once it has printed its address, which carries the token of
# this launch (doc/adr/0012-local-listener-security.md).
url=""
for _ in $(seq 1 100); do
  url="$(sed -n 's/^sdash is serving at //p' "$work/stdout")"
  if [ -n "$url" ]; then
    break
  fi
  running || fail "sdash exited before it printed its address"
  sleep 0.1
done
[ -n "$url" ] || fail "sdash printed no address within 10 s"
origin="${url%%\?*}"
origin="${origin%/}"

# Nothing is served to a client that has not signed in.
code="$(status "$origin/api/v1/status")"
[ "$code" = 401 ] || fail "the API answered $code, not 401, without a session"

# The printed address signs the client in and leads to the page. A binary
# without the user interface answers 404 here, which --fail turns into an
# error.
request --fail --location --cookie-jar "$work/cookies" \
  --output "$work/index.html" "$url" ||
  fail "the printed address did not lead to the page"
script="$(sed -n 's/.*<script[^>]* src="\.\{0,1\}\/\{0,1\}\(assets\/[^"]*\)".*/\1/p' "$work/index.html" | head -n 1)"
[ -n "$script" ] ||
  fail "the page names no script under assets/, so it is not the built user interface"
code="$(status --cookie "$work/cookies" "$origin/$script")"
[ "$code" = 200 ] || fail "the script of the page, $script, answered $code"

request --fail --cookie "$work/cookies" \
  --output "$work/status.json" "$origin/api/v1/status" ||
  fail "the API did not answer a signed-in client"
grep -q '"version"' "$work/status.json" || fail "the status names no version"

# A signal is how sdash is stopped, and a clean stop is exit 0
# (doc/adr/0020-go-lines-tools-and-libraries.md).
kill -TERM "$pid"
for _ in $(seq 1 100); do
  running || break
  sleep 0.1
done
if running; then
  fail "sdash was still running 10 s after SIGTERM"
fi
code=0
wait "$pid" || code=$?
pid=""
[ "$code" -eq 0 ] || fail "sdash exited with $code after SIGTERM"

echo "smoke test passed: $bin serves its user interface and its API at $origin"
