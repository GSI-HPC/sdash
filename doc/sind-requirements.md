<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# What sdash needs from sind

Status: input for [sind issue 90](https://github.com/GSI-HPC/sind/issues/90),
"Support sackd and slurmrestd", written on 2026-10-03. No sind release meets
it yet.

sdash's end-to-end tests, fixtures and vendored slurmrestd specifications all
come from clusters that [sind](https://github.com/GSI-HPC/sind) creates
([record 0016](adr/0016-e2e-and-fixtures-on-sind.md)). sind runs no slurmrestd
today, which holds back every Slurm-facing part of sdash. This document says
what sdash needs and why; how sind provides it is sind's design. The facts
were read from sind `main` (v0.10.0) and `next` (1ca52cb), from Slurm 25.11
and 26.05, and from Rocky Linux 10's package lists; no cluster was run.

## What sdash will do with a sind cluster

Once per supported Slurm release line (25.11 and 26.05 today), through the
`sind` command and, in CI, through `GSI-HPC/sind-action`:

1. **Create** the cluster of `e2e/testdata/sind-cluster.yaml` with that line's
   node image, with one user for each role sdash tells apart.
2. **Seed** a fixed scenario through `sind exec`, in a fixed order so that job
   ids repeat: QOS, a reservation, a drained node, and jobs left completed,
   failed, cancelled, running, pending and held, one of them an array.
3. **Mint tokens**: one per user, and one that has expired when it is used.
4. **Reach slurmrestd** directly and through the system `ssh` with sind's
   exported configuration ([record 0006](adr/0006-direct-or-through-ssh.md)).
5. **Capture** the daemon's OpenAPI document, the answer to every GET without
   side effects in the parser versions sdash speaks (v0.0.44, and v0.0.45 on
   26.05), and the error cases: no token, a malformed, an expired and an
   unknown user's token, a denied operation, an unknown id, an unloaded parser.
6. **Test** `bin/sdash` against the cluster with Go tests behind
   `//go:build e2e`, then **tear down** with `sind delete cluster`.

## Requirements

Each states the need, the reason, and the check sdash's suite makes before it
trusts a cluster. They are cited as M1 to M9 (must have) and U1, U2 (useful).

### Must have

1. **slurmrestd is in the node image of both release lines.**
   - Why: Slurm's configure skips it, with only a warning, unless it finds an
     HTTP parser and json-c (`auxdir/slurmrestd.m4`), and sind's Dockerfile
     installs no HTTP parser on either branch. 25.11 takes libhttp_parser
     (from 2.6.0) only, 26.05 also llhttp (from 9.0.0); `auth/jwt` needs
     libjwt from 1.10.0, below 2 on 25.11 and below 3 on 26.05
     ([related software](https://slurm.schedmd.com/related_software.html)).
   - Check: `slurmrestd -a list` names `rest_auth/jwt`, `-d list` the parsers.
2. **A slurmrestd that sdash did not start runs in the cluster as an
   unprivileged user, and sind can say when it is up and on which node.**
   - Why: sdash never starts one
     ([record 0003](adr/0003-http-to-an-existing-slurmrestd.md)). slurmrestd
     exits when run as root or SlurmUser (`_check_user` in `slurmrestd.c`);
     Slurm's unit runs it as `slurmrestd`, a user the image lacks.
   - Check: `sind get cluster -o json` shows it healthy and names its node.
3. **`rest_auth/jwt` works on `/slurm/` and `/slurmdb/` with a token from
   `scontrol token`** ([JWT](https://slurm.schedmd.com/jwt.html)).
   - Why: JWT is how sdash authenticates
     ([record 0007](adr/0007-jwt-and-the-token-source.md)). Slurm requires a
     key, with `AuthAltTypes=auth/jwt` and its `jwt_key` set for slurmctld and
     slurmdbd before they start, and a slurmrestd that runs with
     `SLURM_JWT=daemon`. On `next`, `slurm.main` and `slurm.slurmdbd` could
     carry the two lines, but nothing can place a key file before the daemons
     start.
   - Check: with a token, a `/slurm/` and a `/slurmdb/` request answer 200.
4. **A token can be had for any cluster user, with a lifespan down to a
   second**: `scontrol token username=<user> lifespan=<seconds>` as root
   through `sind exec`, and a user's own `scontrol token` over ssh.
   - Why: each role needs its token, the expired-token cases need one that
     runs out mid-test, and the second form is what sdash suggests to users.
   - Check: the suite mints all its tokens this way.
5. **Each of three listeners can be had**: a TCP port on the cluster network,
   a TCP port on localhost only, and a unix socket that cluster users may
   connect to.
   - Why: how production listens is not decided, so sdash takes a TCP target
     or a socket path, directly or behind an sshd. sind hides no port: the
     host reaches every node port over the bridge. Only a localhost or socket
     listener makes a test of the SSH path fail when the hop is broken.
   - Check: from the host the node's address refuses the localhost port; a
     cluster user's `ssh -F` with sind's `ssh_config` reaches it and the socket.
6. **The endpoint can be learned from sind**: `sind get cluster -o json`
   names the node and what it listens on, or the default is documented and
   stable.
   - Why: neither the suite nor a developer should guess a port or a path.
   - Check: the suite writes its sdash cluster profile from that output.
7. **Accounting**: the `db` role, Linux users, Slurm accounts, associations,
   coordinators and admin levels, and `sind exec --user`, as `next` has them
   (`DESIGN.md`: Database Node, Users, Slurm Accounts).
   - Why: slurmrestd serves `/slurmdb/` only with accounting configured, and
     sdash reads job history, associations and the user's own role there.
   - Check: `GET /slurmdb/v0.0.44/user/<name>` with `with_assocs` and
     `with_coords` returns what the cluster file declares.
8. **sackd runs beside slurmrestd where the cluster uses `auth/slurm`.**
   - Why: that is the production arrangement sdash is written for. On a node
     without another Slurm daemon, client commands such as `scontrol token`
     authenticate through sackd
     ([authentication](https://slurm.schedmd.com/authentication.html)); `next`
     enables it on the submitter with identity `clientIds`.
   - Check: `sind get cluster` lists both on one node, and the user's
     `scontrol token` of M4 works there.
9. **All of it is in a tagged sind release and in the images published for
   both release lines**, with the exact Slurm version discoverable as today
   (the `sind.slurm.version` label, `slurm_version` in `sind get cluster`).
   - Why: `mise.toml` and sind-action install a release, and CI pulls images.
     The published images (25.11.8 and 26.05.4, built from `main`) have no
     libjwt, and v0.10.0 knows no `db` role, users or accounts. Fixtures
     record the exact release: behaviour changes between maintenance releases.
   - Check: sind's version matches slurmrestd's `meta.slurm.version`.

### Useful

1. **slurmrestd's environment can be set from the cluster file**, at least
   `SLURMRESTD_JSON`, `SLURMRESTD_DATA_PARSER_PLUGINS` and `SLURM_DEBUG_FLAGS`.
   - Why: compact output is a site's choice and well under half the default
     size ([research](research/slurmrestd.md#payload-sizes)); a site may load
     fewer parsers; and slurmrestd logs request headers, sdash's `User-Agent`
     among them, only under the `NET` debug flag
     ([record 0008](adr/0008-user-agent.md)).
   - Check: bodies are compact, an unloaded parser answers 404, and
     `sind logs <node> slurmrestd` shows the header.
2. **Further `AuthAltParameters` options can be set beside the key.**
   - Why: sites cap lifespans (`max_token_lifespan`) or stop users creating
     tokens (`disable_token_creation`); sdash's token command must say so.
   - Check: with the option set, the user's `scontrol token` is refused.

## What sdash does not need from sind

- **Seeded Slurm objects** beyond M7: sdash creates QOS, reservations, node
  states and jobs through `sind exec`, and partitions and
  `AccountingStorageEnforce` through `slurm.main`.
- **Published ports or anything new for SSH**: on Linux the host reaches the
  node addresses on sind's networks, and sshd on every node, the realm key in
  each user's `authorized_keys` and the exported `ssh_config` are on `next`.
- **The JWT key, `rest_auth/local` or YAML output**, or TLS in slurmrestd: a
  test of an `https://` endpoint can put a proxy of its own in front.
- **The Go API** (sdash drives the `sind` command, as clusterctl does), or
  images of older patch releases.

## Open points for the sind design

1. Is slurmrestd a property of an existing role or a role of its own, and can
   it sit on the submitter, where sackd and the users' sshd already are?
2. Can one slurmrestd have several listeners at once, as `SLURMRESTD_LISTEN`
   allows? If not, sdash creates one cluster per listener and release line.
3. Which identity mode gives `auth/slurm` with sackd and still lets JWT work
   on 25.11? There `auth/jwt` finds the token's user by a local lookup in
   slurmctld and slurmdbd (`uid_from_string` in `auth_jwt.c`);
   `use_jwt_client_ids` exists from 26.05. `clientIds`, the one mode with
   `auth/slurm`, keeps the Linux users off the db node, and off the
   controllers without `controllerUsers`.
4. How does the 25.11 image get libhttp_parser? Rocky Linux 10 packages llhttp
   9.1.3 and no http-parser, and EPEL 10 has none either.
5. Does slurmrestd under `SLURM_JWT=daemon` itself depend on sackd in an
   `auth/slurm` cluster, or do only the client commands on its node?

## How sdash's side looks until then

Until a sind release meets the must-have list, sdash has no `e2e/` directory
and no Slurm-facing code, and `mise.toml` stays at sind 0.10.0. What it adds
then follows clusterctl's `e2e/` package, Makefile and CI job. The cluster
file, in the keys of `next` (whose parser accepts it; v0.10.0 stops at
`accounts`), before the settings that sind will define:

```yaml
kind: Cluster
name: slurm
realm: sdash-e2e
identity: clientIds  # auth/slurm, sackd on the submitter; see open point 3
accounts: [physics, {name: theory, parent: physics, limits: {MaxJobs: 2}}]
users:
  - {name: alice, uid: 2001, accounts: [theory]}
  - {name: bob, uid: 2002, accounts: [physics, theory], coordinator: [physics]}
  - {name: carol, uid: 2003, accounts: [physics], adminLevel: operator}
  - {name: dave, uid: 2004, accounts: [physics], adminLevel: admin}
  - {name: erin, uid: 2005}  # no association
slurm: {main: "AccountingStorageEnforce=associations,limits,qos\n"}
nodes: [controller, db, submitter, worker: 3]
```

- `make e2e-up` creates that cluster, `make e2e` builds `bin/sdash` and runs
  `go test -tags e2e ./e2e/` with `SDASH_E2E_BINARY` set, and `make e2e-down`
  deletes it. `TestMain` fails, and does not skip, without sind or a cluster.
- CI runs one job per release line: it reads the sind version from
  `mise.toml`, sets `defaults.image`, creates the cluster with
  `GSI-HPC/sind-action@v2`, runs `make e2e` and keeps the node logs on failure.
- The capture of specifications and fixtures runs in the same package; its
  make target has no name yet.
