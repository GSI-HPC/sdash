<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0032: The Slurm client as built

Status: proposed

## Context

[0005](0005-versions-releases-and-capabilities.md),
[0007](0007-jwt-and-the-token-source.md) and
[0009](0009-one-tolerant-wire-model.md) decided how sdash speaks to
slurmrestd, and
[initial-conclusions.md](../initial-conclusions.md#5-version-story) proposed
a layout of packages for it. All of it was read from documentation and
source. [0031](0031-slurmrestd-end-to-end-on-26-05.md) opened the gate to a
slurmrestd on a sind cluster with Slurm 26.05, and the first client was
built and tested against it. Some of what it found differs from what the
records expected, and some choices were left to whoever built it.

Observed on 26.05.5, in the error cases under
`internal/slurm/releases/testdata/r2605/`:

| Request | No token | Malformed or expired token |
| --- | --- | --- |
| ping | 401, `text/plain` | 200, no error, the controller not responding with "Protocol authentication error" |
| job list (`/slurm/`) | 401 | 511, Slurm error 1007 |
| QOS (`/slurmdb/`) | 401 | 502, Slurm error 7000 "Unable to connect to database" |

An unknown job is 404 with error 2017. An unknown node is 200 with an error
whose number is 0 and no node. `/openapi/v3` is served to any token.

## Decision

- **Packages.** Below `internal/slurm/`: `versions` (the parsers sdash
  speaks and the negotiation, with a directory per parser), `releases` (a
  profile per release line, `r2605.go`, and its error cases), `errs` (the
  kinds of failure), `auth` (tokens), `wire` (the structs and the
  streaming decoder) and `client` (the connection); `slurmrestdtest` is a
  fake slurmrestd that answers with the captures alone. The `dialect`
  record of the proposal is the `Conn` of `client`. `capability`, `model`,
  `parse` and the cache come with the first views that need them.
- **Only captured parsers are known.** The registry holds v0.0.45. A server
  that offers none of the known parsers is refused, which today includes
  every 25.11 server: v0.0.44 joins once a capture of it on a sind cluster
  exists ([0016](0016-e2e-and-fixtures-on-sind.md)).
- **Connecting** reads `/openapi/v3`: the parsers from `info.x-slurm`, the
  release from the same place, and the operations the server binds, which
  capabilities will ask for. It then pings slurmctld, because slurmrestd
  serves its document to any token and only slurmctld tells a bad one: a
  ping in which no controller responds and one reports "Protocol
  authentication error" is a refused token.
- **Classification.** A failure is one of seven kinds: protocol,
  unauthenticated, forbidden, not found, rejected, unavailable,
  unsupported. The Slurm error number decides first (1, 1007, 2002, 2017,
  7000), the HTTP status through the release's profile second, and what
  HTTP says of a status in general last. An answer of success that carries
  errors is a failure. The answer to a node by a name slurmctld does not
  know, an error without a number and no node, counts as not found.
- **Error 7000 stays unavailable.** On `/slurmdb/` slurmrestd answers a bad
  token as it answers a slurmdbd that is down, so the client cannot tell
  them apart; the ping of `/slurm/` with the same token can.
- **Tokens.** sdash reads two claims of a token without verifying it:
  `exp`, to renew it a minute before it expires, and `sun`, the user it
  names, which goes into `X-SLURM-USER-NAME`. A `Keeper` holds the token of
  a cluster, runs the token command or reads the file again in time, asks
  again after a refusal, and does not send a token whose expiry has passed.
  A token prints and logs without its secret.
- **No redirect is followed.** The token travels in slurmrestd's own
  header, which net/http does not drop when a redirect leaves the host.
- **The endpoint** is an `http://` or `https://` URL with an optional base
  path and CA file. The unix socket and the route through ssh of
  [0006](0006-direct-or-through-ssh.md) are later transports below the same
  client.
- **Fixtures are normalised as they are vendored.** `e2e/normalise.jq`
  moves every point in time so that the run starts at
  2026-01-01T00:00:00Z, moves IPv4 addresses into 192.0.2.0/24, and sets
  what measures the machine to 0: the latency of a ping, the load and free
  memory of a node, CPU times and every figure of a diag answer. The HTTP
  status of each error case is vendored beside it in `status.tsv`. The
  capture artifact keeps the daemon's bytes.

## Why

- A refused token has to be found before the user looks at an empty list,
  and the ping is the one request that reaches slurmctld, costs little and
  answers on every cluster.
- A parser that no capture shows is a schema nobody has checked the
  structs against; refusing it says so, where speaking it would fail later
  and less clearly.
- Normalised fixtures differ from one capture to the next where Slurm sends
  something new, which is what a reviewer of a new capture looks for.

## Costs

- sdash cannot connect to a 25.11 cluster yet, although
  [0004](0004-slurm-25-11-is-the-floor.md) makes 25.11 the floor.
- Connecting costs the whole OpenAPI document, about 2 MB on a server with
  four parsers, and a ping.
- An expired token on an accounting request reads as slurmdbd being
  unreachable. A view of accounting data has to ping slurmctld before it
  says which.
- The claims of a token are trusted for its expiry and its user. A token
  whose claims do not say is passed on as it is and renewed only when
  slurmrestd refuses it.
- The normalised times are those of a run moved in a block: two captures
  still differ by the seconds the scenario took, and the usage figures of
  the fair-share tree are left as they were.
