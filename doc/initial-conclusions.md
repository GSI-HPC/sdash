# Initial conclusions

Status: first architecture position, 2026-10-03. Not yet validated against a live slurmrestd.

Inputs:

- the UI design handoff in [`design/`](design/);
- the Radar study in [`research/radar.md`](research/radar.md);
- the slurmrestd facts in [`research/slurmrestd.md`](research/slurmrestd.md);
- the project owner's decisions listed below.

A first draft of this position was attacked by five independent reviews (site security and operations, Go backend,
frontend, delivery scope, and a devil's advocate arguing alternative architectures). Section 12 lists what changed.

## 1. Decisions by the project owner

| # | Decision |
|---|---|
| 1 | Minimum supported Slurm release is **25.11**. sdash supports 25.11 and later; clusters on 25.11 and on 26.05 exist today. The UI adapts to what the REST API version of the connected cluster offers. The codebase needs a strong, explicit version story. |
| 2 | sdash **connects to an existing slurmrestd**. It never starts or manages one. The slurmrestd, and the sackd it runs beside, may be reachable only behind a given sshd. |
| 3 | Audience for now: a handful of users and admins, not everyone. |
| 4 | Every upstream request carries a **User-Agent** that identifies sdash and its version, so sdash versions in use are visible on the slurmrestd side. |
| 5 | Access is **strictly HTTP to slurmrestd**. No Slurm CLI fallback. Features slurmrestd cannot serve wait for slurmrestd to grow. |
| 6 | Pixel accuracy against the prototype is not required. The owner is the designer; design changes are discussed directly. |

## 2. Product shape

One static Go binary, `sdash`, that embeds a React single-page app. It binds loopback, prints its URL, opens the
browser, and then connects to slurmrestd. The Go server sits between the browser and slurmrestd and acts under the
**user's own Slurm identity**; slurmctld and slurmdbd remain the enforcement point. There is no service account, no
second permission system, no desktop shell and no site-hosted multi-user service.

## 3. From Radar: adopt, change, skip

| Area | Radar | sdash |
|---|---|---|
| Binary and embed | `go:embed`, CGO off, GoReleaser, tracked placeholder in the embed directory | Adopt |
| Build and dev loop | `build: frontend embed backend`; air plus Vite proxying `/api`; `--dev` serves from disk | Adopt |
| Startup | Bind, print URL, open browser, connect asynchronously, show connection state in the UI | Adopt; skip the browser launch under SSH or without a display; fall back to a free port and remember it |
| HTTP server | chi, stdlib `flag`, stdlib `log`, bare `http.Serve` | chi and `flag`; `log/slog`; `http.Server` with timeouts and graceful shutdown |
| State ownership | Package-level singletons | Constructor injection; one `Cluster` object per configured cluster |
| Live updates | SSE stream that invalidates browser queries | Browser polls the local server; no SSE in the first versions (section 6) |
| Local security | Loopback plus Host check, no token | Per-launch token exchanged for a cookie, same-origin check on every API request (section 7) |
| UI foundation | React 19, Vite, Tailwind v4, TanStack Query, react-virtuoso, fontsource fonts | Adopt |
| Dialogs, menus, tooltips | Hand-rolled | A headless primitive library (Base UI); the prototype has no accessibility affordances to start from |
| Charts, editor | Hand-rolled SVG; Monaco | Hand-rolled SVG and CSS; no Monaco, no chart library |
| Routing | Hand-written path parsing | Declarative lazy routes; filters and drawers in the URL |
| Keyboard shortcuts | Custom registry with scopes and key sequences | Adopt the pattern |
| Tests | Real server over a fake cluster for Playwright; fixtures shared by Go and TypeScript | Adopt, with a fake slurmrestd |
| Desktop app, Helm, npm package split, separate `pkg/` module, MCP, telemetry | Present | Skip; MCP can be added later on top of a service layer |

## 4. Connectivity

sdash talks to a slurmrestd that the site operates. A cluster profile names the endpoint and how to reach it:

- **direct:** an `http(s)://` URL, with optional base path and CA file;
- **through SSH:** the same endpoint (TCP address or unix socket path) reached through a given sshd. sdash runs the
  system `ssh` client to forward the connection, so the user's `~/.ssh/config`, jump hosts, multiplexing and MFA
  apply unchanged. sdash never handles SSH credentials.

Credentials are separate from the transport: a JWT from a file, an environment variable or a user-configured
command, or none where the endpoint identifies the peer itself (`rest_auth/local` on a unix socket). Tokens are held
in memory, never written to the profile, and never sent to the browser.

Every upstream request sends `User-Agent: sdash/<version> (<os>/<arch>)`, with the version stamped at build time.

Open: how the GSI slurmrestd instances authenticate and how they are exposed (section 11).

## 5. Version story

### Policy

- Supported: Slurm 25.11 and later, which means data_parser v0.0.44 and later.
- sdash speaks the **newest data_parser version it knows that the server offers**: v0.0.44 on 25.11, v0.0.45 on
  26.05. Each release then gets its full feature set.
- A release newer than sdash knows is reached through the newest known parser it still serves. That covers at most
  the three releases after the parser's own (v0.0.45: 26.11, 27.05 and 27.11; it is removed in 28.05), and only
  where the site has not unloaded that parser. sdash then applies the behaviour profile of the newest release it
  knows and marks the cluster as newer than tested. When the server offers none of the parsers sdash knows, sdash
  refuses the connection and says so.
- The schema follows the parser version; behaviour (status codes, bugs, bound methods) follows the server release.
  The two are independent keys: a 26.05 server can be asked for v0.0.44, and fixes land in maintenance releases.
  Both are recorded per connection. The release is read from the server (`info.x-slurm` in `/openapi/v3`,
  `meta.slurm.version` in responses) and never inferred from the parser. It is the release of the slurmrestd build;
  slurmctld and slurmdbd can differ.

### Rules

1. **Two keys, two places.** Schema material is keyed on the data_parser version and lives in one directory per
   parser: vendored spec, paths, field and enum fix-ups, response fixtures. Behaviour is keyed on the Slurm release
   and lives in one file per release: status mapping, known bugs with the maintenance release that fixes them,
   error-case fixtures. A connection combines one of each. Adding a Slurm release adds one parser directory and one
   release file; dropping one deletes them.
2. **No other code mentions a version.** Handlers, services and UI code ask for a named *capability*
   (`job.requeue`, `partition.update`, `conf.read`, `job.resources`, `accounting`, …). A test fails when a version
   comparison appears outside the version packages.
3. **Capabilities are evaluated against what the server actually offers.** A capability declares up to three kinds
   of requirement: bound operations (method and path), schema elements of the negotiated parser (a property, an
   enum value, a query parameter), and a minimum server release for behaviour the spec cannot show. After
   authentication sdash reads the server's own `/openapi/v3` and checks the first two kinds against it, because
   sites can restrict loaded plugins and releases backport endpoints; the third is checked against the release
   table. The vendored spec of the negotiated version is the fallback. Each unavailable capability carries a
   reason: needs a newer release, not in this parser, or not offered by this server.
4. **The UI adapts through one mechanism.** The backend serves the capability set per cluster; the frontend gates
   with one hook. Actions the user's role lacks are hidden. Actions the cluster lacks are shown disabled with the
   capability's reason, so the UI says "needs Slurm 26.05" only when that is the cause.
5. **Specs and captured responses are the API truth**, never the design mock data.

### Proposed layout

```
internal/slurm/
  versions/
    registry.go     supported parser versions in order; negotiation
    v0044/          data_parser v0.0.44, new in Slurm 25.11
      openapi.json  vendored spec
      profile.go    paths, field and enum fix-ups
      testdata/     captured responses in this schema
    v0045/          data_parser v0.0.45, new in Slurm 26.05
  releases/
    r2511.go        status mapping, known bugs and the maintenance release that fixes them
    r2605.go
    testdata/       captured error cases per release
  wire/             tolerant wire structs shared by all versions
  capability/       capability names, requirements, evaluation
  dialect/          per-connection record: release, parser, bound operations, quirks
  client/  transport/  auth/  errs/  model/  parse/
```

- `wire` holds one set of hand-written structs with the union of fields sdash uses. On reads, unknown fields are
  ignored, and a field the negotiated parser lacks is passed on as unavailable, not as zero.
- Request bodies are built for the negotiated parser and never contain a field or enum value it lacks, because
  slurmrestd ignores an unknown field with only a warning and rejects an unknown flag. An "Ignoring unknown field"
  warning on a write counts as a failure.
- Across v0.0.42 – v0.0.45 only two property types change. One of them lies between the two supported versions
  (`partition_info.cpus.task_binding`: integer in v0.0.44, array in v0.0.45) and needs a custom decoder. Enum
  vocabularies change more often (eight between v0.0.44 and v0.0.45), so fix-ups and tests cover enum values as
  well as paths and types.
- A **conformance test** walks every vendored spec: each JSON path and enum value the wire structs read or write
  must exist with a compatible type, or be listed as absent for that version. The same test checks each
  capability's requirements and regenerates a support matrix (capability by release) that is committed as
  documentation.
- Decode and mapping tests run over the captured responses of every version. A container matrix (slurmctld,
  slurmdbd, slurmrestd for each supported release) runs the integration tests.
- Adding a release is a written checklist: vendor the spec, run the conformance test, capture fixtures, add quirks
  and capabilities, regenerate the matrix, extend the CI matrix, extend the registry.

Alternative considered: one generated Go package per parser version (oapi-codegen) with a mapper per version. It
gives compile-time field checking, but costs about 19,000 to 22,000 generated lines per parser version (about 41,000
for v0.0.44 and v0.0.45 together) plus one mapper set per version, for a near-zero schema difference. The generated
client (whole body buffered, pointer types for all 137 job fields) also peaked at roughly twenty times the memory of
a streamed 34-field struct on a 100,000-job list: about 2 GB against 107 MB.

## 6. Slurm client and data flow

- **Client:** one generic upstream call. Classify by Slurm `error_number` first and only then by HTTP status.
  Non-2xx and small responses are buffered, and their envelope (`meta`, `errors`, `warnings`) is read before the
  payload. Large collections (jobs, nodes, accounting jobs) are decoded as a stream, one element at a time, into a
  staging snapshot. slurmrestd writes the envelope after the collection, so the staging snapshot replaces the cached
  one only after the trailing `errors` and `warnings` have been read.
- **Domain model:** version-neutral `Job`, `Node`, `Partition`, `Reservation`, `Association`, `QOS`. The browser
  never sees raw slurmrestd shapes.
- **Parsing package**, built first with table tests: hostlists, TRES and GRES strings, `{set, infinite, number}`,
  state-flag arrays, Slurm time formats, array task strings, dependency strings, exit codes, display ids.
- **Cache:** each kind per cluster is a read-through cache with a minimum age and single-flight fetches. A
  background refresh runs only while a visible browser tab asks for that kind. No upstream requests happen without
  a viewer.
- **Cadence:** jobs and nodes default to 30 s, partitions, reservations and QOS to 60 s, and never faster than ten
  times the last fetch-plus-decode time. The handoff's 2 s and 5 s options go; the UI shows the age of the data.
  `update_time` is not used: it is not a delta and is broken for nodes on 25.11.
- **Accounting queries** always carry a time window, default to a short one, and skip steps unless one job is
  opened.
- **Browser API:** resource endpoints under `/api/c/{cluster}/…` returning normalised DTOs with server-side filter,
  sort and windowing (`{generation, total, facets, rows}`), ETags, and a small `pulse` endpoint with per-kind
  generation counters and connection state. The browser polls `pulse` and refetches what changed.
- **No SSE at first.** The upstream is polled anyway, each event stream would hold one of the browser's six
  connections per origin, and a hidden tab would keep polling slurmctld.
- **Writes:** typed endpoints. A dry-run returns method, path and body for the confirm dialog; execution uses the
  same builder. Upstream GETs with side effects (requeue, reconfigure) are treated as writes. Writes are never
  retried automatically. After a write only the affected entity is refetched.
- **Identity and roles:** user name from the JWT claim or the profile; admin level, coordinator accounts and
  associations from the accounting user record. Role and capability together drive what the UI offers.
- **Connection status:** a state machine plus latency and byte counters measured in the client, as the handoff's
  status popover needs.

## 7. Local server security

- Bind loopback on both address families. Per-launch random token in the opened URL, exchanged for an `HttpOnly`
  cookie; the token is never passed on a command line.
- Host allow-list against DNS rebinding. Same-origin check (`Origin`, `Sec-Fetch-Site`) on every `/api` request,
  not only on non-GET methods. No CORS outside `--dev`. A strict Content-Security-Policy.
- A unix-socket listener for use on shared hosts, where other local users can reach loopback ports.
- A read-only mode. Exec-capable profile fields (SSH host, token command) are file-only and never writable through
  the HTTP API.

## 8. Frontend

React 19, strict TypeScript, Vite, Tailwind v4 with the handoff's tokens as CSS variables, TanStack Query,
react-router with lazy routes, react-virtuoso, Base UI primitives, DM Sans and DM Mono bundled through fontsource.

- Three table components instead of one generic one: a windowed virtual table (Jobs, History), a plain sortable
  table, and a tree table (Accounts, Fairshare).
- All visualisations are hand-rolled CSS or SVG. Dense grids use one delegated tooltip per grid and memoised cells.
  Large node counts and large job arrays need a compact rendering that the handoff does not cover yet.
- Forms keep a draft object and call the backend's dry-run for the live request preview, so request bodies are
  built once, in Go.
- TypeScript API types are generated from the Go DTO structs and checked against golden responses.
- Accessibility is added during the rebuild: focus rings, ARIA for the owned components, and a contrast pass on the
  token values.

## 9. Configuration, persistence, packaging

- Cluster profiles in a hand-edited TOML file under the XDG config directory. sdash reads it and never rewrites it.
  Program-written state goes to a separate JSON state file. No database.
- GoReleaser, `CGO_ENABLED=0`, tarballs with checksums. No telemetry and no update check for now.

## 10. Testing

- Fixtures are captured from real slurmrestd instances per release, including error cases.
- In unit tests the fake upstream is an `http.RoundTripper`. `cmd/sdash-testserver` runs the real server over a
  fake slurmrestd for Playwright.
- Golden JSON shared by Go and TypeScript tests keeps derived state (job and node state mapping) identical on both
  sides.

## 11. Open questions

| # | Question | Decides |
|---|---|---|
| 1 | How do the existing slurmrestd instances authenticate (JWT, or local peer credentials on a unix socket with sackd), and how are they exposed (TCP, unix socket, behind a proxy, on which host)? | Transport and credential code |
| 2 | slurmrestd itself logs request headers only under the `NET` debug flag, which also logs the token header; its normal request line has method and path only. Is there a proxy in front of it whose access log records the User-Agent, or is another site-side change acceptable? | Whether the version reporting (decision 4) works without site changes |
| 3 | Where will sdash run: on laptops and workstations, on submit nodes, or both? | Listener defaults, release targets |
| 4 | Typical and peak queue size; `PrivateData`; `rl_enable`; is `SLURMRESTD_JSON=compact` set? | Cadence defaults, whether cluster-wide job views are practical |
| 5 | When is a Slurm release dropped: with SchedMD's support window, or when no own cluster runs it? | Lifetime of each version directory |
| 6 | Order of the views for the first users. | Scope of the first releases |

A first spike against one 25.11 and one 26.05 cluster should answer 1, 2 and 4, capture the first fixtures, and
measure bytes and seconds per job-list poll.

## 12. What the review changed

- Per-version generated clients were replaced by one tolerant wire model with a spec conformance test.
- SSE and a background poller were replaced by a read-through cache and browser polling with generations.
- Fixed 10 – 30 s poll floors became an adaptive cadence, after real job records turned out to be three to seven
  times larger than assumed (6 – 8 KB compact, about 18 KB in slurmrestd's default output, against 2.6 KB).
- Error classification moved from HTTP status to Slurm `error_number`, because the status mapping differs between
  25.11 and 26.05.
- Capability flags are evaluated against the server's own spec (operations and schema elements) plus a release
  table, instead of a table keyed on the parser version alone.
- Version-specific material was split in two: schema per parser version, behaviour per Slurm release.
- The local listener was hardened for shared hosts.
- Admin editing, Submit and the API explorer moved to the end of the order: largest blast radius, least finished
  design.

Proposals that depended on starting slurmrestd or on the Slurm CLI were dropped by owner decisions 2 and 5.
