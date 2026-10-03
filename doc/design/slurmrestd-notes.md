# slurmrestd — capabilities (Slurm 26.05.4 · data_parser v0.0.45)

Sources: slurm.schedmd.com/rest_api.html (generated from the OpenAPI spec), rest.html, slurmrestd(8), SC24 REST talk. Radar: README + DESIGN.md.

## Architecture
- Translates JSON/YAML over HTTP into Slurm RPCs; runs inside the Munge perimeter.
- **Stateless** — every request handled in its own thread, nothing cached. No push / SSE / websockets.
- Content plugins: `openapi/slurmctld` → `/slurm/…` (live state), `openapi/slurmdbd` → `/slurmdb/…` (accounting). Several data_parser versions can be loaded side by side (`-d v0.0.43,v0.0.44,v0.0.45`). Full spec at `/openapi/v3`.
- Auth: `X-SLURM-USER-NAME` + `X-SLURM-USER-TOKEN` (JWT from `scontrol token`) or `Authorization: Bearer`; `rest_auth/local` over a unix socket; or an authenticating proxy in front.
- Every response carries `meta` (plugin type, data_parser, Slurm release, cluster, client user/group), `errors[]` and `warnings[]`.
- Many numbers are `{number, set, infinite}` triples (e.g. time_limit = UNLIMITED).
- Version lifecycle: v0.0.40 (23.11) … v0.0.43 (25.05, removed 26.11) … v0.0.45 current.

## /slurm/v0.0.45 — slurmctld (live)
- **Jobs**: `GET jobs/` (update_time, flags) · `GET jobs/state/` (lightweight, job_id CSV) · `GET job/{id}` · `POST job/submit` (script + job desc, het jobs) · `POST job/allocate` · `POST job/{id}` (update: hold/release, priority, time limit…) · `DELETE job/{id}` (signal, flags) · `DELETE jobs/` (bulk signal by filter) · `GET job/{id}/requeue` (Incomplete, Hold, SpecialExit) · `POST jobs/requeue` · `GET resources/{job_id}` (allocation per node → socket → core)
- **Nodes**: `GET nodes/` · `GET node/{name}` · `POST node/{name}` (state, reason, features, weight, comment) · `POST nodes/` (bulk) · `DELETE node/{name}` · `POST new/node/` (dynamic node)
- **Partitions**: `GET partitions/` · `GET partition/{name}` · `POST partitions/` (create/update) · `DELETE partition/{name}`
- **Reservations**: `GET reservations/` · `GET reservation/{name}` · `POST reservation` · `POST reservations/` · `DELETE reservation/{name}`
- **Cluster**: `GET licenses/` · `GET shares` (fairshare tree) · `GET diag/` (main + backfill scheduler cycles, RPCs by type/user, pending RPCs) · `GET ping/` (primary/backup controllers, latency) · `GET reconfigure/` · `GET conf` (slurm.conf dump; NEXT_JOB_ID, BOOT_TIME)

## /slurmdb/v0.0.45 — slurmdbd (accounting)
accounts (+ accounts_association) · associations (single + bulk) · clusters · config (GET dump / POST load) · conf · diag · instances · jobs (history w/ filters; POST job/{id}, POST jobs/ updates) · ping · qos · tres · users (+ users_association; administrator_level) · wckeys — each with GET / POST / DELETE as applicable.

## Key job fields
job_id, name, user_name, account, partition, qos, job_state[] + state_reason, priority, nodes, node_count, cpus, tres_req_str / tres_alloc_str, time_limit, submit/eligible/start/end_time, exit_code {return_code, signal, status}, array_job_id / array_task_id / array_task_string, het_job_id, dependency, stdout_expanded / stderr_expanded, command, current_working_directory, gres_detail, job_resources.nodes.allocation[] {name, cpus, memory, sockets[].cores[].status}.

## Gaps vs a Radar-style UI
- No live push → poll; `update_time` gives incremental refresh.
- No job stdout/stderr content (paths only) → no log dock without a companion server.
- No exec / terminal.
- No event history → a timeline must be synthesised (submit/start/end times, node reason + reason_changed_at, reservations) or recorded by a companion.
- No topology graph — relations are implicit (partition ↔ node ↔ job ↔ account/QOS).
- No "can-i" query → derive permissions from slurmdbd user administrator_level + account coordinators.

## Radar patterns worth borrowing
Cluster (context) switcher, scope filter (namespace → partition/account), ⌘K palette, `g`+letter view nav, j/k rows, Enter = detail, Esc = close. Views: Home, Issues, Resources (kind sidebar + smart-column table + right drawer with YAML/related/logs/events), Topology, Timeline, Audit. Dense, layered surfaces, hairline borders, severity badges (success / warning / error / info / neutral), one accent, drawers slide from the right, bottom dock.
