# slurmrestd facts sdash depends on

Collected on 2026-10-03 from the Slurm documentation (slurm.schedmd.com, version 26.05), the Slurm source
(`slurm-25.05`, `slurm-25.11`, `slurm-26.05` and `master` branches), SchedMD conference slides, and the source of
two existing clients ([Slurm-web](https://github.com/rackslab/Slurm-web),
[SlinkyProject/slurm-client](https://github.com/SlinkyProject/slurm-client)). Web-sourced claims were checked a
second time by an independent pass against primary sources.

**Nothing here was run against a live slurmrestd.** Every behaviour statement is from documentation or source
reading and should be confirmed in the first spike on a real cluster.

## 1. Releases and data_parser versions

Two version axes matter:

- the **Slurm release** of the server (25.11, 26.05, …), which decides behaviour: status codes, bug fixes, which
  methods are bound;
- the **data_parser version** in the URL path (`/slurm/v0.0.44/…`), which decides the JSON schema.

Each release ships four parser versions. The newest one is new in that release.

| Slurm release | First tagged | Parser versions shipped | Newest |
|---|---|---|---|
| 25.05 | 2025-05-29 | v0.0.40 – v0.0.43 | v0.0.43 |
| 25.11 | 2025-11-06 | v0.0.41 – v0.0.44 | v0.0.44 |
| 26.05 | 2026-05-26 | v0.0.42 – v0.0.45 | v0.0.45 |
| 26.11 (in development) | announced for November 2026 | v0.0.43 – v0.0.46 | v0.0.46 |

- Latest maintenance releases on 2026-10-03: 26.05.4, 25.11.8, 25.05.9.
- Published removal dates: v0.0.42 in 26.11, v0.0.43 in 27.05, v0.0.44 in 27.11, v0.0.45 in 28.05. These dates
  have already moved once, so discover versions at run time instead of hard-coding lifetimes.
- A parser version is frozen after release apart from security fixes and small additive edits. The handlers behind
  it (`openapi/slurmctld`, `openapi/slurmdbd`) are **not** versioned and keep changing, so the same `v0.0.44` path
  can behave differently on 25.11 and on 26.05.
- A site may load only a subset of parsers (`slurmrestd -d …`). Removed or unloaded versions answer 404.
- Schema churn is small. Across v0.0.42 – v0.0.45, a recursive diff of the four specs found two type changes in
  about 1,860 property paths (`stats_msg.schedule_cycle_sum` int32 to int64, `partition_info.cpus.task_binding`
  int32 to array), 12 removals and 48 additions. `job_info` grows from 128 to 137 properties with no type change.

### Endpoints by parser version

| Needs | Endpoints |
|---|---|
| v0.0.43 | reservation create and update (`POST reservation`, `POST reservations/`). `DELETE reservation/{name}` works on every parser version shipped with 25.05 and later |
| v0.0.44 | `GET resources/{job_id}` (allocation per node, socket, core), `POST new/node`, slurmdb job update |
| v0.0.45 | `GET job/{id}/requeue`, `POST jobs/requeue`, `POST partitions/`, `DELETE partition/{name}`, `GET conf`, `GET slurmdb/conf` |

Binding is per HTTP method: a method the parser cannot serve answers 405 on an existing path and 404 on an absent
one. Availability also depends on the server release (some endpoints were backported to older parsers) and on
whether accounting is configured (`/slurmdb/*` is absent without it).

### Behaviour by server release

| Topic | 25.11 | 26.05 |
|---|---|---|
| Request rejected by slurmctld/slurmdbd (including permission denied) | HTTP 500 | HTTP 422; `EPERM` maps to 403 |
| Request without credentials | HTTP 401 (25.11.0 answers 500; fixed in 25.11.1) | HTTP 401 |
| Expired or invalid JWT on `/slurm/*` | HTTP 511, `error_number` 1007 | HTTP 511, `error_number` 1007 |
| Expired or invalid JWT on `/slurmdb/*` (by source, not observed) | HTTP 502, `error_number` 7000, "Failed to open slurmdbd connection" | same |
| `GET nodes?update_time=` when nodes changed | HTTP 500 (bug) | fixed in 26.05.3 |
| HTTP/1.1 keep-alive | honoured | honoured; pipelining fixed |
| `/healthz`, `/readyz`, `/livez` | absent | present (behind authentication) |

The release a client can read (`info.x-slurm` in `/openapi/v3`, `meta.slurm.version` in every response) is that of the
slurmrestd build. slurmctld and slurmdbd can be on another release, for example a slurmdbd shared by clusters on
different releases.

## 2. Authentication and identity

- **`rest_auth/jwt`:** send `X-SLURM-USER-TOKEN` or `Authorization: Bearer` (not both). `X-SLURM-USER-NAME` is
  optional. slurmrestd forwards the token unverified; slurmctld and slurmdbd validate it. The request runs as the
  user named in the token. Only SlurmUser or root tokens may act for another user, which is the authenticating-proxy
  pattern SchedMD recommends for single sign-on.
- **`scontrol token`:** HS256, 1800 s by default, `lifespan=` to change. Sites can cap it
  (`AuthAltParameters=max_token_lifespan=`), disable user token creation (`disable_token_creation`), or verify
  tokens from an external identity provider (`jwks=`), in which case Slurm-side token creation is off by default.
  A requested lifespan above the cap is rejected, not clamped.
- **`rest_auth/local`:** unix socket, peer identified through `SO_PEERCRED`. A peer is accepted when its uid equals
  the uid slurmrestd runs as, or when slurmrestd runs as root in `become_user` mode and switches to the peer's
  user. A root peer is also accepted and may name any user. The plugin has no MUNGE-specific code, so it should also work with `AuthType=auth/slurm` (sackd), but the
  documentation only mentions MUNGE.
- **Transport:** native HTTPS exists since 25.05 (`tls/s2n`, an optional build dependency); many deployments are
  plain HTTP behind a reverse proxy. `Upgrade` requests are rejected, so there are no WebSockets.
- **No whoami.** `meta.client.user` is not filled per request. The user name must come from the JWT claim or from
  configuration; the admin level then comes from `GET /slurmdb/{v}/user/{name}`.
- **Authentication precedes routing.** A request without credentials is answered 401 on every path, including
  `/openapi/v3` and unknown paths. With `rest_auth/jwt`, slurmrestd only checks that a token header is present, so an
  expired or invalid token still reaches the router: by source `/openapi/v3` answers 200 and an unknown path 404.
  Version discovery therefore needs a token header but not a valid token, and it does not prove the token works;
  only a call that reaches slurmctld or slurmdbd does.

## 3. Polling semantics and load

- slurmrestd is stateless and synchronous. Each request becomes one or more RPCs to slurmctld or slurmdbd. SchedMD
  "strongly encourages" a caching layer between clients and slurmrestd.
- **`GET /slurm/{v}/jobs` has no filter and no pagination.** It returns every job visible to the authenticated
  user. Its only parameters are `update_time` and `flags`.
- **`update_time` is not a delta.** It is compared with one timestamp for the whole collection: if anything
  changed, the entire collection is returned. "No change" looks different per endpoint: HTTP 304 with an empty body
  for nodes (and, by source, for partitions and reservations), HTTP 200 with an empty `jobs` array plus a warning
  for jobs. The job timestamp is bumped from about 80 places in slurmctld, so on a busy cluster it rarely saves
  anything.
- **`GET /slurmdb/{v}/jobs`** has about 35 filters (users, account, partition, state, start and end time, node,
  `skip_steps`, `show_batch_script`, …) but no limit or offset. **Called without any query parameter it walks the
  whole accounting history**, so a time window is mandatory. Epoch times need the `uts<seconds>` form and state
  filters must be repeated instead of comma-separated (reported by Slurm-web's client code).
- `GET /slurm/{v}/jobs/state?job_id=…` is a lightweight state query. The OpenAPI spec declares the wrong response
  type for it (integer job ids; the handler sends strings), so it must be decoded by hand.
- Rate limiting: `SlurmctldParameters=rl_enable` is a per-user token bucket (30 tokens, 2 refilled per second by
  default). A throttled call stalls inside slurmrestd instead of failing. `--max-connections` defaults to 124.

### Payload sizes

Measured on responses captured from real slurmrestd instances (Slurm-web's test fixtures for releases 24.05 to
26.05), not on a production cluster. The fixtures hold at most 30 jobs each and were re-serialised with indentation
by the capture tool, so the pretty column approximates slurmrestd's own default output:

| Record | Compact JSON | slurmrestd default (pretty) |
|---|---|---|
| live job | 6.2 – 7.6 KB | 14.5 – 20 KB |
| node | 1.5 – 1.65 KB | |
| slurmdb job | 3.4 – 3.8 KB | |

A queue of 10,000 jobs is therefore roughly 75 MB compact or 190 MB pretty per poll; the design handoff assumed
2.6 KB per job. Compact output needs `SLURMRESTD_JSON=compact` in the daemon's environment, which is a site setting.

Decoding 100,000 replicated job records (743 MB compact) in Go, one run each with Go 1.26.8 and Go 1.27.1 on one
machine (the ranges are the two toolchains):

| Decoder | Time | Peak memory |
|---|---|---|
| oapi-codegen types, whole body read then unmarshalled | 10 – 14 s | about 2 GB |
| hand-written 34-field struct, decoded as a stream | 5.8 – 7 s | about 107 MB |

## 4. Responses and errors

- Handler responses carry an envelope: `meta` (plugin, parser, Slurm version, cluster), `errors[]`
  (`description`, `error_number`, `error`, `source`) and `warnings[]`. Collections also carry `last_update`.
- Rejections before the handler runs (authentication, unknown URL) are `text/plain` without the envelope.
- Many soft failures are HTTP 200 with `warnings[]`, for example per-task errors of a job update.
- `error_number` is the Slurm errno and is stable across releases. The HTTP status mapping is not (see the table in
  section 1), so classification should key on `error_number` first.
- Controller or database unreachable: HTTP 502 with "Unable to contact slurm controller (connect failure)" or
  "Unable to connect to database"; socket timeout is 504. On `/slurmdb/*` the same 502 with `error_number` 7000 is,
  by source, also what an expired or invalid token produces.
- The envelope members are written **after** the collection in list responses (`jobs`, then `meta`, `errors`,
  `warnings`), so a client that streams a large list sees them last.
- Every error reply closes the connection.
- Requeue and reconfigure are HTTP **GET** requests with side effects.

## 5. OpenAPI specification

- Served at `/openapi/v3` (also `/openapi.json`, `/openapi.yaml`), behind authentication. Its content reflects the
  plugins and parser versions that instance has loaded, so it lists the versioned operations the server offers
  (about 2 MB for a default server with four parser versions). slurmrestd's own `/openapi*`, `/healthz`, `/readyz`
  and `/livez` paths are hidden from it. Its `info.x-slurm` block names the Slurm release and the loaded plugins.
  A default 25.11 or 26.05 server also loads `openapi/util` (hostlist conversion), which adds two operations per
  version to the figures below.
- Generated offline with
  `slurmrestd -f /dev/null --generate-openapi-spec -s slurmctld,slurmdbd -d v0.0.NN > openapi.json`.
- For v0.0.45 alone: about 490 KB, 45 paths, 72 operations, 183 schemas. OpenAPI 3.0.3 without `oneOf`, `anyOf` or
  `nullable`. Numbers that can be unset or unlimited are objects of the form `{set, infinite, number}`.
- SchedMD tests against openapi-generator 7.3.0 and oapi-codegen 2.4.1 and advises generating against one version
  and keeping generated code in the repository. oapi-codegen produces about 18,000 to 22,000 lines of Go per parser
  version (21,932 for v0.0.45).
- The spec declares its own licence in `info.license`: Apache 2.0.
- Besides paths and types, **enum vocabularies** change between versions (eight between v0.0.44 and v0.0.45, for
  example renamed `select_type` values). slurmrestd rejects an unknown flag value, and ignores an unknown request
  field with only a warning under HTTP 200.

## 6. What slurmrestd does not offer

No event stream or push of any kind, no job stdout/stderr content (paths only), no exec, no permission query, no
rack layout (node records carry only a `topology` string, from v0.0.43), no GPU utilisation.

Recent additions that narrow the gaps:

- slurmctld-native OpenMetrics endpoints (`/metrics/jobs`, `nodes`, `partitions`, `scheduler`,
  `jobs-users-accts`) on the slurmctld port since 25.11, when `MetricsType=metrics/openmetrics` is set;
- the job script through slurmdb (`show_batch_script`, returned in the job's `script` field) when the site stores
  it. The job environment is not returned: `show_job_environment` is accepted, but the job record has no environment
  field in any parser version up to v0.0.46;
- `stdout_expanded` and `stderr_expanded` paths on live jobs since v0.0.43.

## 7. How sites expose slurmrestd

SchedMD states that slurmrestd "is not designed to be directly internet facing" and recommends a TLS-terminating,
preferably authenticating, proxy. Documented site setups differ on every axis: direct HTTPS with self-service
tokens (Duke, MeluXina), reachable only inside the site network with portal-issued tokens (DESY), private network
without `scontrol token` (AWS PCS), or no user-facing slurmrestd at all (CSCS and NERSC offer their own APIs). Some
endpoints sit under a path prefix or present certificates that are not publicly trusted. A client therefore needs
a base path, a CA option, externally supplied tokens, and a way to reach an endpoint through SSH.

## 8. Prior art

| Project | Shape | Relevant to sdash |
|---|---|---|
| Slurm-web (MIT) | Admin-deployed agent, gateway and Vue frontend; one service identity plus its own RBAC; view-only | Supports v0.0.41 – v0.0.45 with about 600 lines of per-version adapters over raw JSON. Ships captured slurmrestd responses per release, including error cases. |
| SlinkyProject/slurm-client (Apache-2.0) | Go client generated with oapi-codegen for v0.0.42 – v0.0.45 | Vendored specs for four versions and a container setup per Slurm release. Its wrapper has no slurmdb and requires a token. |
| s9s, srest | Go terminal UIs on slurmrestd with JWT | |
| turm, stui and others | Terminal UIs that parse CLI output | |

No user-run, single-binary web UI on slurmrestd that acts under the user's own Slurm identity was found.

## 9. Corrections to the design handoff

The handoff in [`../design/`](../design/) is the reference for look and interaction. Its statements about the
API are not reliable; the vendored OpenAPI specs and captured responses are.

| Handoff says | Actually |
|---|---|
| `update_time` fetches only changes | All-or-nothing per collection; unusable on nodes before 26.05.3 |
| Target is v0.0.45 only | v0.0.45 needs Slurm 26.05. On 25.11 there is no slurm.conf view, no requeue and no partition drain/resume over REST |
| "v0.0.43 (25.05, removed 26.11)" | v0.0.43 is removed in 27.05 |
| Expired token is HTTP 401 | HTTP 511 on `/slurm/*`; by source HTTP 502 with `error_number` 7000 on `/slurmdb/*`. 401 means slurmrestd itself refused the request (missing or malformed credentials) |
| Permission problems are 403 | 422 on 26.05, 500 on 25.11 |
| Version mismatch shows as 404 on ping | Only when credentials are sent; without them the answer is 401, because authentication is checked before routing. The token does not have to be valid for the 404 |
| About 2.6 KB per job | 6 – 8 KB compact, about 18 KB in the default output |
| Radar uses shadcn | Radar uses no component library |
| Mock data shows response shapes | `sdash-data.js` is hand-written; several field names differ from the spec |
| Association editor request body | Emits two `max` keys, so one overwrites the other |
| QOS editor | Shows GrpTRES but never sends it |
| Fairshare preview | Uses the classic formula while the UI and mock config say FAIR_TREE |
| Bulk cancel with `flags: ['BATCH_JOB']` and SIGKILL | May signal only the batch step; needs checking |
| Cluster list from `slurmdb/clusters` | The prototype actually connects per cluster; each cluster is its own endpoint |

The handoff also has no design for connection setup, authentication, settings, loading states or per-view error
states (only a global failure banner, the status pill and dimmed stale content are designed), or the reservation
and add-user forms. It has no accessibility affordances (no ARIA, removed focus outlines).

## Sources

- https://slurm.schedmd.com/rest.html, `rest_api.html`, `rest_clients.html`, `rest_quickstart.html`,
  `slurmrestd.html`, `jwt.html`, `metrics.html`, `openapi_release_notes.html`, `release_notes.html`
- https://github.com/SchedMD/slurm: `src/slurmrestd/`, `src/plugins/data_parser/`, `src/common/http.c`,
  `src/slurmctld/proc_req.c`, `src/slurmctld/rate_limit.c`, `CHANGELOG/`
- https://slurm.schedmd.com/SC24/REST-API.pdf, https://slurm.schedmd.com/SC25/REST_Clients.pdf
- https://github.com/SlinkyProject/slurm-client (`api/v0042` … `api/v0045`)
- https://github.com/rackslab/Slurm-web (`slurmweb/slurmrestd/`, `tests/assets/slurmrestd/`)
- Site documentation: Duke DCC, DESY Maxwell, MeluXina, AWS PCS, CSCS FirecREST, NERSC Superfacility API
