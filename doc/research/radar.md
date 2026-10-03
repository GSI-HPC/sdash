# Radar study

[Radar](https://github.com/skyhook-io/radar) is a local-first Kubernetes UI by Skyhook (Apache-2.0). sdash is meant to
come in the same shape and with the same look and feel, against slurmrestd instead of the Kubernetes API. This note
records how Radar ships its UI as a single executable, what it is built from, and which parts are worth reusing.

- Studied: `main` at commit `09719d88` (committed 2026-10-02 UTC). Binary measurements are from release v1.15.0 (2026-09-27).
- Method: source reading. Nothing was built or run, except where a measurement is stated.
- Paths are relative to the Radar repository root at that commit.

What sdash takes from this is decided in [`../initial-conclusions.md`](../initial-conclusions.md).

## Summary

- Radar is one static Go binary with a React single-page app embedded through `go:embed`. It binds loopback, prints
  a URL, opens the browser, and only then connects to the cluster, so connection progress is shown in the UI.
- The same binary runs in-cluster (Helm) by changing flags. A separate Wails binary provides a desktop app.
- The Go side is deliberately plain: chi, stdlib `flag`, stdlib `log`, `encoding/json`, Server-Sent Events.
- The frontend is React 19, Vite, Tailwind v4 and TanStack Query with **no UI component library**. Radar's own docs
  mention shadcn/ui; the source does not use it.
- Several of Radar's defaults are wrong for a shared HPC login node: a fixed port that fails hard when busy, an
  unconditional browser launch, and loopback as the only access boundary.

## 1. Shipping the binary

### Startup (`cmd/explorer/main.go`)

| Step | What Radar does | Where |
|---|---|---|
| CLI parsing | Stdlib `flag`, 69 flags declared inline in `main()`. Subcommands (`diagnose`, `probe`, `cloud`) are dispatched by hand on `os.Args[1]`. No cobra, pflag or viper. | `main.go:47-204` |
| Config | `~/.radar/config.json` is loaded first and its values become flag defaults, so precedence is flag, then file, then built-in. Written 0600 through tmp + rename. | `main.go:96-105`, `internal/config/config.go:133-198` |
| Port and bind | Port 9280, bind `127.0.0.1`. A busy port is fatal for the CLI. Only the desktop app falls back to an OS-assigned port, and it remembers that port because browser storage is per origin. | `main.go:105`, `internal/server/listen_address.go:15`, `cmd/desktop/port.go:17-21` |
| Order | Parse flags, apply the memory limit, parse kubeconfig (no network), create the server, bind, print the startup block, open the browser, then connect to the cluster. Progress reaches the browser over SSE. | `main.go:474-525`, `:583-618` |
| Browser | `open`, `xdg-open` or `rundll32` through `cmd.Start()`. Suppressed with `--no-browser`. No SSH or headless detection. | `internal/app/browser.go:28-45` |
| Shutdown | SIGINT/SIGTERM closes the listener and calls `os.Exit(0)`. The server is a bare `http.Serve`: no timeouts, no drain. | `internal/server/server.go:1166`, `:1256-1270` |

### Embedding the frontend

- The directive is `//go:embed all:dist` in `internal/static/embed.go:9-10`.
- The Makefile chain is `build: frontend embed backend` (`Makefile:58-83`):
  1. `npm run build` in `web/` (type-check, then `vite build`);
  2. wipe `internal/static/dist` and copy `web/dist/*` into it;
  3. `go build -ldflags "-X main.version=…" ./cmd/explorer`.
- GoReleaser repeats the same sequence in `before.hooks` (`.goreleaser.yaml:6-12`).
- `internal/static/dist` is git-ignored, but two placeholder files are tracked. `go build ./...` and `go test` therefore
  work on a fresh clone without Node.
- The fallback handler serves an existing file, and `index.html` for everything else (`server.go:1003-1036`).
- No `Cache-Control` is set on static assets, although Vite emits hashed file names.
- Compression is chi's compressor with klauspost gzip at level 1, bypassed for streams
  (`internal/server/compress.go:24-115`).
- `--base-path` is supported: Vite builds with `base: './'`, and Go rewrites asset URLs in `index.html` and injects a
  runtime-config global (`server.go:1070-1124`).

### Development loop

- `make watch-frontend` runs Vite on `:9273` with `/api` proxied to the Go server on `:9280`
  (`web/vite.config.ts:15-23`).
- `make watch-backend` runs [air](https://github.com/air-verse/air), which rebuilds and starts the binary with
  `--dev --no-browser` (`.air.toml:9-19`). `--dev` serves `web/dist` from disk instead of the embed
  (`server.go:933-938`).

### Release engineering

- GoReleaser v2, one build, `CGO_ENABLED=0`, linux/darwin/windows on amd64/arm64 (no windows/arm64), ldflags
  `-s -w -X main.version={{.Version}}`, tar.gz/zip plus `checksums.txt`, Homebrew tap and Scoop bucket. No rpm/deb
  for the CLI (only the desktop app ships them), no signing, no SBOM (`.goreleaser.yaml`).
- A `v*.*.*` tag triggers `release.yml`: GoReleaser, a multi-arch distroless image built from the prebuilt binaries,
  the Helm chart, krew, and the MCP registry.
- `install.sh` is POSIX sh, resolves the version from the `releases/latest` redirect and does not verify checksums.
- In-cluster and local mode are the same binary; the mode is detected at runtime and the Helm chart only passes flags.
- The CLI has an update *check* only (`/api/version-check`, cached for an hour, mapped to an install-method-specific
  upgrade command; `internal/version/version.go`). Self-replacement exists only in the desktop app.
- v1.15.0 for linux/amd64 is 131 MB stripped (38 MB as tar.gz) with 159 module dependencies. The size comes from
  Kubernetes-side dependencies (client-go, helm, cilium, cel); this attribution is inferred from the dependency list.
- `internal/memlimit` (about 160 lines) sets `GOMEMLIMIT` to 85 % of the tightest cgroup memory limit it finds.

### Local security model

- Loopback bind and no auth token in local mode (`--auth-mode` defaults to `none`).
- A global Host-header check answers 403 unless the host is localhost or a loopback address, which guards against
  DNS rebinding (`listen_address.go:63-88`).
- A same-origin check (`Sec-Fetch-Site`, then `Origin` equal to `Host`) exists but is called per handler from four
  files, not as middleware (`internal/server/exec.go:45-84`).
- CORS is always on for `http://localhost:*` and `http://127.0.0.1:*` with credentials (`server.go:465-474`).
- `/debug/pprof` and a host-shell WebSocket are exposed in local mode.

## 2. Desktop app

- Wails v2 (`github.com/wailsapp/wails/v2 v2.16.0`) as a second main package, `cmd/desktop`.
- It starts the same HTTP server in-process and points the webview at `http://127.0.0.1:<port>` through a redirect
  page (`cmd/desktop/proxy.go`). No Wails IPC bindings are used; native features go through ordinary
  `/api/desktop/*` endpoints.
- Most native code repairs things the webview breaks: clipboard, file downloads, external links, menu accelerators,
  theme detection and GPU workarounds on Linux, and importing the login-shell `PATH` for GUI-launched apps.
- It needs CGO, one native build runner per OS, WebKitGTK on Linux, and Apple code signing and notarization. The
  release workflow is 497 lines, against 250 for everything else.
- Users gain a dock icon, a window and a self-updater. The UI and API are identical to the browser version.

## 3. Backend architecture

- **Layering:** `cmd/explorer` builds a config and calls `internal/app` (composition root), which creates
  `internal/server` (router, SSE hub) over domain packages. State lives in package-level singletons wired through
  callback registries. One consequence: no `t.Parallel()` call in 655 Go test files.
- **HTTP:** chi v5.3.2. One 6,115-line `internal/server/server.go` holds the route table. Middleware order is logger,
  recoverer, usage, loopback Host check, gzip, CORS, optional auth (`server.go:453-479`). A 60 s timeout covers only
  the non-streaming route group. Errors are `{"error": "..."}`; a few handlers add an `error_code`.
- **Lists:** mostly bare JSON arrays, filtered and sorted in the browser.
- **Live updates:** the main channel is one SSE stream, `/api/events/stream` (`internal/server/sse.go`); separate SSE
  endpoints carry logs and long-running operations. Named events with JSON data, a
  heartbeat every 30 s, a full snapshot on connect, a bounded per-client buffer with counted drops, and no
  `Last-Event-ID` replay. The browser treats change events as *invalidation signals* and refetches over REST;
  interval polling remains as a fallback (`web/src/App.tsx:1073-1125`). WebSockets are used only for terminals.
- **Cache:** client-go informers emit change records that feed the timeline, the SSE hub and debounced derived views
  (`pkg/k8score/cache.go`, `internal/k8s/cache.go`). Radar also contains a plain poller in the shape sdash needs:
  `MetricsHistoryStore`, a 30 s ticker with ring buffers (`pkg/k8score/metrics_history.go:269-294`).
- **Connection state:** a connecting/connected/disconnected state machine with a classified error type, pushed over
  SSE and exposed at `GET /api/connection` (`internal/k8s/connection_state.go`).
- **Persistence:** everything under `~/.radar/` (no XDG). JSON files for config, UI settings and per-cluster
  profiles; the profile file uses a lock file plus a revision compare-and-swap. The timeline is an in-memory ring by
  default, optionally SQLite through `modernc.org/sqlite` (pure Go, so CGO stays off), or Postgres for shared
  installs.
- **Multi-cluster:** one active kubeconfig context per process. Switching tears down and re-initialises every
  subsystem under a mutex with generation counters (`internal/k8s/context_manager.go:497-640`).
- **MCP:** `modelcontextprotocol/go-sdk`, a stateless streamable-HTTP handler mounted at `/mcp`, 25 read and 7 write
  tools that read the same in-process cache as the REST handlers.
- **`pkg/`** is a separate Go module only because a sibling product (Radar Hub, not publicly visible) imports it.
- **Tests:** stdlib `testing` only, table-driven, client-go fakes, `httptest` against the real router.
  `cmd/testserver` runs the real server and embedded UI over a fake cluster for Playwright. Golden JSON fixtures are
  asserted from both Go and TypeScript tests.

## 4. Frontend

| Concern | What Radar uses |
|---|---|
| Core | React 19.3, strict TypeScript (type-checked with TypeScript 7.0 through an npm alias; 6.0 stays installed for tooling), Vite 8 |
| CSS | Tailwind 4.3 through `@tailwindcss/vite`, configured in CSS (`@theme`); a legacy `web/tailwind.config.js` is still tracked but nothing loads it |
| Routing | react-router-dom 7 without a route table: only `BrowserRouter`/`MemoryRouter` and the navigation hooks are used, and the view is derived by hand-written path parsing |
| Data | TanStack Query 5; about three quarters of the query and mutation call sites sit in one 7,356-line `web/src/api/client.ts` |
| Global state | React Context only |
| Icons, fonts | lucide-react; DM Sans and DM Mono bundled through fontsource, so they work offline |
| Tables | Hand-rolled on react-virtuoso; no TanStack Table |
| Charts | Hand-rolled SVG; timeline lanes are absolutely positioned divs |
| Dialogs, tooltips, toasts, menus | Hand-rolled; no shadcn/ui, Radix or cmdk anywhere in the lockfile |
| Editor and graph | Monaco, shiki, xyflow, elkjs, xterm (Kubernetes-specific needs) |
| Tests | vitest (mostly pure functions and `renderToString`), five Playwright specs against `cmd/testserver` |

- **Design system:** CSS custom properties on `:root` using `light-dark()`, switched by a `.dark` class, mapped into
  Tailwind with `@theme inline` (`packages/k8s-ui/src/theme/`). `DESIGN.md` is written as a contract for coding
  agents. Rules are enforced by a script that bans native `title=` attributes and by tests that scan source files.
- **Shell:** collapsible nav rail, header with context switcher and an inline command bar, a right-hand drawer, a
  bottom dock. Keyboard shortcuts go through a custom 358-line registry with scopes, two-key sequences and an
  auto-generated help overlay (`packages/k8s-ui/src/hooks/useKeyboardShortcuts.tsx`).
- **Packages:** `web/` and `packages/k8s-ui` are published as npm packages so the sibling product can embed them.
  For a project without a second consumer this split is pure cost.
- **Build:** `vite build` writes `web/dist` with `base: './'`. Three manual chunks, no `React.lazy`, no bundle-size
  gate. No CDN fetches at runtime were found.

### sdash prototype tokens compared with Radar's

The colour tokens in the sdash design handoff are value-identical to Radar's in both themes for backgrounds, text
levels, the default and light borders, the accent family and the semantic colours. The subtle border and the
selection tint differ slightly in alpha. The tokens also differ in name (short names such as `--t1`,
`--bd`, `--ac`), radii (8/6/4/3 px against Radar's 14/10/8/6), shadows (blue-tinted), shell sizes, and the theme
switch (`[data-theme="dark"]` against `.dark`). The prototype loads its fonts from a CDN, which the real app must
not do.

## 5. Developer workflow and quality gates

- **Tools:** Go 1.26, Node 24, npm workspaces. Nothing is pinned locally (`air` is installed with `@latest`).
- **CI** (`.github/workflows/ci.yml`, about five minutes): gofmt check, `go test`, `go build`; `npm ci`, type-check,
  vitest, eslint, `vite build`; one Playwright spec; Helm lint. CodeQL and Dependabot run separately.
- **Not gated:** `go vet`, any Go linter, `-race`, coverage, four of the five Playwright specs.
- **Releases:** SemVer tags, roughly weekly. The changelog is generated by GoReleaser from conventional commits.
- **Conventions:** comments explain why and are otherwise omitted; handlers map sentinel errors to a fixed status
  table; conventional commits; no DCO or CLA.
- **Agent docs:** a 42 KB `CLAUDE.md` with a read-first routing table, an embed-pipeline warning and a rule that
  releases need explicit authorisation; command files for QA and visual testing. These docs have drifted from the
  code in several places.
- **Licence and governance:** Apache-2.0, single vendor, no NOTICE file and no per-file headers.

## 6. What not to copy

| Radar practice | Problem for sdash |
|---|---|
| Fixed port, fatal when busy | Fails as soon as two users run it on one login node |
| Unconditional browser launch | Useless or wrong on a headless node reached over SSH |
| Loopback as the only access boundary | On a shared node other local users can reach `127.0.0.1` ports |
| CORS always on, same-origin check per handler | Easy to miss a route; production is same-origin and needs no CORS |
| Bare `http.Serve`, `os.Exit` on signal | No timeouts and no graceful shutdown |
| Package-level singletons | Tests cannot run in parallel; several clusters per process become awkward |
| A 6,115-line route file, a 9,441-line table component, a 2,721-line `App.tsx` | Hard to maintain and to review |
| Hand-written path parsing, partially URL-backed drawers | Deep links and back/forward break |
| Two npm packages, a separate `pkg/` Go module | Exist only for a second product |
| No Go linter, no race detector, mostly manual end-to-end tests | Cheap to add at the start, expensive to retrofit |
| Makefile whose first target deploys | A bare `make` should print help |
