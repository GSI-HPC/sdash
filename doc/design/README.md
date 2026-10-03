# Handoff: sdash — web UI for the Slurm REST API (slurmrestd)

## Overview
**sdash** is a browser dashboard for Slurm clusters that talks exclusively to **slurmrestd** (Slurm 26.05, OpenAPI `data_parser/v0.0.45`). It covers both end users (submit / watch / cancel own jobs) and operators/admins (nodes, partitions, reservations, accounting, QOS, fairshare), with a role-aware UI driven by the user's Slurm `AdminLevel` and account-coordinator status. Visual style is inspired by **Radar** (skyhook-io/radar): cool blue-gray neutrals, one accent blue, DM Sans / DM Mono, dense tables, right-side drawers, ⌘K palette, keyboard navigation.

## About the design files
The files in this bundle are **design references built in HTML** — a working, clickable prototype with mock data that shows intended look and behavior. They are **not production code to ship**. Recreate the designs in the target codebase's environment (e.g. React + TypeScript + Tailwind, or whatever the project uses) with its established patterns. If there is no codebase yet, a good fit is **React + TypeScript + Vite + Tailwind** (Radar itself uses React/Tailwind/shadcn), TanStack Query for polling, and a thin typed client generated from slurmrestd's OpenAPI spec (`slurmrestd --generate-openapi-spec -s slurmctld,slurmdbd -d v0.0.45`).

To open the prototype: serve the folder statically and open `sdash.dc.html` (it needs `support.js` and `sdash-data.js` next to it).

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, states and interactions are final. Recreate pixel-accurately using the codebase's component library. All data is mocked (`sdash-data.js`); replace with real API calls (see *Data & API mapping*).

---

## Global layout
- Root: full viewport, CSS grid `rows: 52px | 1fr`.
- **Header** (52px, `bg-base`, bottom border `--bd`), left→right, gap 12px, padding `0 14px 0 16px`:
  1. Logo block (196px): 26×26 accent square radius 5 with "s/" (DM Mono 12/500, white) · "sdash" (15/600, -0.01em) · **status pill** (see *Connection status*).
  2. Cluster switcher button (h32, radius 6, border, surface bg): green dot · cluster name (600) · Slurm version (DM Mono 11, t3) · chevron. Dropdown 300px lists clusters from `GET /slurmdb/v0.0.45/clusters/`.
  3. Search button (flex 1, max 440, min 44; h32; elevated bg) "Search jobs, nodes, views…" + `⌘K` kbd → opens command palette.
  4. Spacer.
  5. Refresh control: button "Refresh 5s ▾" (label "Refresh" hidden <1100px) + 30×30 reload icon button (turns accent-filled in Manual mode). Menu: 2s, 5s, 15s, 30s, 1 minute, Manual; footnote "Polls use update_time…".
  6. AdminLevel pill (h24, radius 12): shield icon + `Admin` / `Operator` / `User`, tone acc/info/neutral; optional violet pill `coord <accounts>`; tooltip shows source endpoint.
  7. Theme toggle (32×32, sun/moon), avatar circle 30px "JD".
- **Body**: grid `cols: 224px (60px collapsed) | 1fr`, transition 300ms `cubic-bezier(0.32,0.72,0,1)`.
- **Sidebar** (surface bg, right border): nav groups with 11px t4 labels; items h32, radius 5, icon 16px stroke 1.8, label, count pill. Active: `--ac-m` bg, `--ac-t` text, 600. Groups:
  - Cluster: Overview, Nodes (count), Partitions (count), Reservations (count)
  - Workload: Jobs (running+pending count), Submit job, Job history
  - Accounting: Accounts & users, QOS & fairshare
  - System: Diagnostics, slurm.conf, API explorer
  - Bottom pinned: Collapse/Expand button (`[` key). Collapsed: 60px icon rail, tooltips, group labels become 1px dividers. Only the nav scrolls.
- **Main**: scroll container, padding `20px 24px 48px`. Each page starts with a header block: H1 20/600 + subline 12.5 t3 + optional **API hint chip** (DM Mono 11, elevated bg, radius 4, e.g. `GET /slurm/v0.0.45/nodes/`) — togglable setting "showApiHints".
- Global failure banner (when applicable) sits at the top of main; stale content dims to opacity .5.

## Screens

### 1. Overview
- Row 1 — 4 stat cards (grid auto-fit minmax 230px, gap 12): **Nodes** (total, stacked state bar 8px, legend), **CPU allocated** (big %, bar, cores text, memory mini-bar), **GPU allocated** (%, bar, per-type rows H100/A100), **Jobs** (running/pending big numbers, "N waiting > 6h", "N yours"; card click → Jobs).
- Row 2 — 3 cards (auto-fit minmax 300px): **Partitions** (name, default tag, state dot, CPU alloc bar, "R · PD", %; click → Nodes filtered), **Scheduler** (kv: main cycle last/mean, backfill last cycle, depth, backfilled, threads, agent queue; link Diagnostics), **Reservations** (upcoming/active with "ends in / starts in" badge).
- Row 3 — **Cluster map** (10px squares, gap 3, colored by node state; click → node drawer) + **Needs attention** (Operator/Admin only): DRAIN/DOWN nodes with reason, setter, age; "Pending by reason" bars.

### 2. Jobs (`GET /slurm/v0.0.45/jobs/?update_time=…`)
- Toolbar: filter input (id, name, user, account), state chips with counts (All, Running, Pending, Completing, Suspended, Cancelled), partition select, "My jobs" toggle, result count. Primary button "Submit job".
- Bulk bar when rows selected: "N selected · Clear · Cancel selected" (→ `DELETE /slurm/v0.0.45/jobs/` body `{signal, flags, jobs[]}`).
- Table (sticky header, max-height calc(100vh − 250px)): checkbox (only own jobs selectable unless Operator+), Job ID (DM Mono, accent, **click → Job page**), Name + `ARRAY`/`HET` tag, User (+"you"), Account, Partition, State badge, Nodes/Reason (pending reason in warn color), CPUs, GPUs, Time (elapsed / limit + 4px progress bar, warn at >90%), Priority. Sortable: ID, User, State, Time, Priority. Row click → job drawer.
- Job IDs display Slurm-style: `123_7` (array task), `123_[8-63%8]` (pending array remainder), `123+1` (het component).

### 3. Submit job (`POST /slurm/v0.0.45/job/submit`)
- Left: Resources card (grid of fields: name, partition, account (own only for non-admins), QOS, time limit `D-HH:MM:SS`, nodes, tasks, CPUs/task, mem/node GB, GPUs/node, array, dependency) + Batch script textarea (DM Mono, base bg).
- Right: **Placement check** (estimate pill ok/warn/err, validation errors, kv of free CPUs/GPUs, MaxTime, per-node and total request), Submit button (disabled at .45 opacity when invalid), equivalent `sbatch` line; **Request body** JSON preview.
- Validation: time format; time > partition MaxTime; CPUs/mem/GPUs per node exceed node capacity; partition not UP. Changing partition resets QOS/GPUs defaults.
- On submit: toast, navigate to Jobs, open the new job's drawer.

### 4. Nodes (heatmap) (`GET /slurm/v0.0.45/nodes/`)
- Color-by segmented control: **State · Jobs · CPU alloc · CPU load · Memory · GPU alloc**.
- Filters: node search (DM Mono), partition chips, clear.
- State legend chips double as state filters (non-matching cells dim to opacity .14).
- Rack cards (grid auto-fill minmax 236px): header "r07 · cpu · 32 · 72% alloc"; 8-column grid of square cells (radius 3); outline on selected node; hover scale 1.15; tooltip with name/state/CPU/load/GPU.
- Gradient modes: `color-mix(in oklch, var(--ac) p%, var(--hm-cold))`; DRAIN = warn, DOWN = err always.
- **Jobs mode**: filter panel "Show jobs of" [Me / All users / user…] [account] [state] [job id/name search] [Reset] + summary "N jobs on M nodes · CPUs · GPUs"; chips per matching job (click = highlight its nodes with outline, others dim to .3; "Open job"); cell color = share of node held by matching jobs (CPU or GPU, whichever larger); inset 2px surface ring = node shared with other jobs; grey = none. Data from `jobs[].job_resources.nodes.allocation[]` + `gres_detail`, filtered client-side.

### 5. Partitions
Table: partition (+DEFAULT tag, hostlist), state badge, nodes count + stacked state bar, CPU alloc bar, GPU alloc bar, MaxTime / DefaultTime, Tier · QOS · MaxNodes, Jobs R/PD; row click → Nodes filtered. Operator+: Drain/Resume (`POST /slurm/v0.0.45/partitions/`).

### 6. Reservations
Gantt over yesterday → +6 days (8 day columns, today label accent, red "now" line). Rows: name + state badge + node list; segments colored MAINT=warn, DAILY=info, other=violet. Table below (name, state, nodes, start, end, duration, access, flags, Delete for Operator+). "New reservation" (Operator+) → `POST /slurm/v0.0.45/reservation`.

### 7. Job history (`GET /slurmdb/v0.0.45/jobs/`)
Range 24h/7d; 4 stat cards (finished, success rate, CPU-hours, median wait); stacked bar chart per day (Completed info, Failed/OOM/NodeFail err, Timeout orange, Cancelled t4); filters; table with exit code (red if non-zero), elapsed, queue wait, CPU-eff bar (warn <40%), mem eff, end time. ID → Job page.

### 8. Job page (single job, deep view)
Breadcrumb "Jobs / <id>" + "Go to job" input (accepts `123`, `123_7`, `123+1`).
- Header: name, display id, **type** chip (Batch/Array/Heterogeneous), state badge, meta line; actions (Hold/Release, Requeue, Cancel / Cancel this task / Cancel whole array / Cancel all components).
- Lifecycle strip (Submitted · Waited · Started · Ended/Time-limit-at) + elapsed bar; pending reason explanation (incl. `JobArrayTaskLimit`).
- **Array card**: task grid (one cell per index, colored by state, click opens task), state counts + stacked bar, **runtime-per-task bars** (stragglers >1.5× median in orange, failures red), note that pending tasks are one record until started.
- **Het card**: one card per component (+0, +1…) with partition, nodes, resources, state; current component highlighted.
- **Steps**: Gantt (extern, batch, 0..n; dimmed if not in current het component; now line; time-limit hint) + table (step id, het-group tags, state, nodes, tasks, elapsed, CPU time, CPU-eff bar, MaxRSS, exit code).
- **Core allocation**: per node (≤6 shown) two socket grids of 9px core squares (16 per row): this job (accent) / other jobs (`--bd2`) / idle; GPU slots 22px with index.
- **Efficiency**: CPU efficiency, peak memory vs per-node allocation, time used vs limit; GPU utilization row marked "not exposed by slurmrestd"; Jobstats-style advisory notes.
- Side column: Details kv, Dependencies (Waits for / Blocks, with `afterok` etc.), Batch script (from accounting if `AccountingStoreFlags=job_script`), Data sources list + raw JSON toggle.

### 9. Accounts & users (`GET /slurmdb/v0.0.45/associations/`)
Expandable tree table (chevron rotates 90°, 200ms): association, type badge, Shares, FairShare, Default QOS, Allowed QOS, GrpTRES, MaxJobs, R/PD. Expand all / Collapse. Admin: "Add user". Per-row **Edit** (if permitted) else lock icon.

### 10. QOS & fairshare
- QOS table (priority, preempts, mode, MaxWall, MaxTRESPerUser, MaxJobsPU, GrpTRES, UsageFactor, flags, active jobs). Administrator: per-row Edit; others see "QOS definitions are cluster-wide. Only Administrators can change them."
- **Fairshare tree** (`GET /slurm/v0.0.45/shares`): RawShares, NormShares, RawUsage, EffectvUsage, FairShare bar (err <.25, warn <.5, ok). **Edit shares** mode (Admin or coordinator): numeric inputs on editable rows, locks elsewhere; live preview of NormShares (old struck-through → new, green/red) and FairShare; sticky tray "N pending changes" with chips, Discard, **Review & apply** → confirm with `POST /slurmdb/v0.0.45/associations/` body `{associations:[{account,user,cluster,shares_raw}]}`.

### 11. Diagnostics (`GET /slurm/v0.0.45/diag/`)
Job counters since midnight, three kv cards (slurmctld, main scheduler, backfill), RPCs by message type and by user with share bars.

### 12. slurm.conf (`GET /slurm/v0.0.45/conf`)
Search; meta chips (SLURM_VERSION, BOOT_TIME, …); grouped key/value cards (DM Mono, key in accent). Operator+: Reconfigure (`GET /slurm/v0.0.45/reconfigure/`).

### 13. API explorer
Left: filterable endpoint list (slurm/ and slurmdb/, method color GET info / POST ok / DELETE err). Right: method + resolved path, Send, description, permission warning, path-param input, headers (token masked), JSON body editor for POST, curl snippet, response panel (status, ms, size, pretty JSON).

## Overlays
- **Drawer** (right, width min(580px,100vw), top 52px, scrim): kind/id, title, state badge, meta, actions, tabs (Overview / Related / JSON). Job drawer has "Open job page →". Node drawer: CPU/load/mem meters, GPU slots, reason alert, kv, features, jobs list; Operator+: Drain (with reason input), Set DOWN, Resume (`POST /slurm/v0.0.45/node/{name}`).
- **Confirm dialog** (500px): title, description, optional input, request preview (method + path + JSON body), Cancel / primary (red for destructive).
- **Editor dialog** (560px, scrolls): fields 2-col, locked fields with lock icon + reason, "was …" on changed fields, live request body, change count, Apply (disabled until changed). Used for associations and QOS.
- **Command palette** (⌘K): views, actions, and (when typing) matching jobs and nodes; Enter opens first.
- **Toasts** bottom-right: dot + title + DM Mono endpoint/status line, auto-dismiss 3.8s.

## Connection status (header pill + hover popover)
Pill right of "sdash": LED + label (`Live`, `Manual`, `Slow`, `Offline`, `Auth`, `Degraded`, `Error`). Green pulse when live; red blink for errors. Hover opens (click pins) a 420px popover:
- State chip + slurmrestd URL + message.
- Service rows: slurmrestd, slurmctld primary, slurmctld backup, slurmdbd — dot, host, latency/state.
- Sparklines (5m/15m/60m switch, 60 samples): Latency, ↓ Received, ↑ Sent, Requests/s, with max and current.
- kv: data_parser, Slurm version, JWT expiry, refresh interval, last success, requests/bytes per refresh.
Implementation: measure real request timings and payload sizes in the API client; keep a ring buffer per metric (sample on every request / bucket per interval). Ping via `GET /slurm/v0.0.45/ping/` and `GET /slurmdb/v0.0.45/ping/`.

## Failure modes (must be handled)
| Mode | Detect | UI |
|---|---|---|
| Slow | latency > ~1.5s p95 | amber pill "Slow", banner, back off polling to 15s |
| Unreachable | network error / timeout | red "Offline", banner with last-good time + retry count + Retry, dim stale data, block writes |
| Auth expired | HTTP 401 | red "Auth", banner + "Sign in again" |
| slurmctld down | 5xx with "Unable to contact slurm controller" on `/slurm/*` | live pages dim + banner; accounting pages unaffected |
| slurmdbd down | 5xx "Unable to connect to database" on `/slurmdb/*` | accounting pages dim + banner; live pages unaffected |
| API version mismatch | 404 on `/slurm/v0.0.45/ping/` | red "Error", banner explaining `-d` data parsers |
All writes during an affecting failure must fail safely with a toast "Request failed, nothing was changed" + status line.

## Roles & permissions
- `AdminLevel` from `GET /slurmdb/v0.0.45/user/{name}?with_coords` (`administrator_level`: Not Set/None, Operator, Administrator) and coordinator accounts.
- **None/User**: own jobs only (cancel, hold, requeue), submit with own accounts, read everything PrivateData allows.
- **Operator**: any job (+ Extend +1h), node drain/down/resume, partitions, reservations, reconfigure, Needs-attention panel.
- **Administrator**: + slurmdbd writes (accounts, users, associations, allowed QOS, QOS definitions).
- **Coordinator** of account X: may edit shares/limits/default QOS of associations **below** X (sub-accounts and users), not X itself; cannot change allowed QOS or QOS definitions.
- Hide (don't disable) actions the user can't perform; show lock icons only in edit modes to explain scope. slurmctld/slurmdbd remain the enforcement point.

## Interactions, keys, motion
- Keys: `⌘K` palette · `g`+letter navigate (o j s n p r h a q d c x) · `t` theme · `r` reload · `[` sidebar · `Esc` closes overlays.
- Motion: single ease `cubic-bezier(0.32,0.72,0,1)`; sidebar 300ms; chevrons 200ms; hover scale on heatmap cells 120ms. Respect `prefers-reduced-motion`.
- Polling: use `update_time` query param on `/jobs/`, `/nodes/`, `/partitions/` to fetch only changes; poll only what the current view needs.

## State (suggested)
Global: cluster, theme, refreshInterval (0 = manual), connection metrics, failure state, identity (user, adminLevel, coordinatorOf). Per view: filters/sorts (jobs, history, nodes heatmap mode + jobs filter), drawer target, palette, confirm/editor drafts, fairshare pending edits map.

## Design tokens (light / dark)
| Token | Light | Dark |
|---|---|---|
| --bg-base | #F0F3F9 | #0B0F1E |
| --bg-surface | #F8FBFE | #14192A |
| --bg-elevated | #E6ECF5 | #1E2338 |
| --bg-hover | #DDE5F2 | #282E48 |
| --t1 | #1A1C20 | #F5F6F8 |
| --t2 | #555860 | #D8DAE0 |
| --t3 | #6B7080 | #B0B5C0 |
| --t4 | #A0A4AC | #6A7080 |
| --bd | #D8E0EE | #222840 |
| --bd2 | #CDD6E8 | #2C324A |
| --bds | rgba(74,100,180,.10) | rgba(255,255,255,.05) |
| --ac (accent) | #4A7CC9 | #6A9FE0 |
| --ac-l (hover) | #3B66A8 | #8BB5EA |
| --ac-m (muted bg) | rgba(74,124,201,.12) | rgba(106,159,224,.18) |
| --ac-t (accent text) | #3B66A8 | #8BB5EA |
| --hm-cold | #DCE3EF | #1A2034 |

Semantic solids: ok #22C55E · warn #F59E0B · err #EF4444 · info #3B82F6 · violet #8B5CF6 · orange #F97316.
Semantic text (light/dark): ok #15803D/#4ADE80 · warn #92400E/#FBBF24 · err #B91C1C/#F87171 · info #1D4ED8/#60A5FA · violet #6D28D9/#A78BFA · orange #C2410C/#FB923C. Badge backgrounds = solid at 12–18% alpha.
Status mapping: RUNNING ok · PENDING warn · COMPLETING/COMPLETED info · SUSPENDED violet · FAILED/OOM/NODE_FAIL err · TIMEOUT orange · CANCELLED neutral · node IDLE ok · MIXED info · ALLOCATED accent · RESERVED violet · DRAIN warn · DOWN err.
Typography: DM Sans (400/500/600/700) UI; DM Mono (400/500) for ids, paths, hostlists, JSON. Sizes: H1 20/600; card title 13.5/600; body 12.5–13; table 12.5; meta 11.5; badges 11.5/500; micro 10.5.
Radii (tight, per user feedback): cards/panels 8px · buttons/inputs 6px · small buttons/chips 4–5px · badges 3–4px · heatmap cells 3px · bars 1–2px · pills 12px.
Shadows: sm `0 1px 2px rgba(30,45,90,.06)` (dark adds inset hairline) · lg `0 18px 50px rgba(30,45,90,.18)` · drawer `-12px 0 40px rgba(30,45,90,.14)`. Scrim light rgba(20,28,48,.28) / dark rgba(0,0,0,.5).
Spacing: 4px base; card padding 12–16px; page padding 20/24px; grid gaps 12px.

## Data & API mapping (slurmrestd v0.0.45)
- Live: `/slurm/v0.0.45/{jobs/, job/{id}, jobs/state/, nodes/, node/{name}, partitions/, reservations/, licenses/, shares, diag/, ping/, conf, reconfigure/, resources/{id}}`; writes `job/submit`, `job/{id}` (POST update, DELETE signal), `jobs/` (DELETE bulk), `job/{id}/requeue`, `node/{name}`, `nodes/`, `partitions/`, `reservation(s)`.
- Accounting: `/slurmdb/v0.0.45/{jobs/, job/{id} (steps[]), accounts/, associations/, users/, user/{name}, qos/, tres/, clusters/, ping/, diag/}`; writes `associations/`, `users_association/`, `qos/`.
- Auth headers: `X-SLURM-USER-NAME`, `X-SLURM-USER-TOKEN` (JWT; `scontrol token`). Numbers come as `{set, infinite, number}` — normalize in the client.
- Arrays: `array_job_id`, `array_task_id`, `array_task_string`, `array_max_tasks`. Het: `het_job_id`, `het_job_offset`, `het_job_id_set`. Steps from slurmdb `jobs[].steps[]` (state, nodes, tasks, time.user/system, exit_code, tres.consumed). Core layout: `job_resources.nodes.allocation[].sockets[].cores[]`.
- Not available via slurmrestd: live stdout/stderr content, GPU utilization (needs DCGM/Prometheus), rack topology (needs a site mapping, e.g. RacksDB or node features).

## Files
- `sdash.dc.html` — the full prototype (template + logic class). Open in a browser via a static server.
- `sdash-data.js` — mock data generator (`window.SDASH`): clusters, nodes, jobs (incl. array + het families, dependencies), history, reservations, accounts/fairshare, QOS, diag, conf, endpoint list, response mocks, step/script/core-map generators, display-id helpers. Use as a reference for API response shapes.
- `support.js` — runtime for the prototype only (not needed in production).
- `slurmrestd-notes.md` — research notes on slurmrestd capabilities.

Prototype tweaks (top-level props): `showApiHints`, `pollSeconds`, `adminLevel` (None/Operator/Administrator), `coordinatorOf` (comma list), `failureMode` (ok/slow/unreachable/auth/ctld/dbd/version), `startView`.
