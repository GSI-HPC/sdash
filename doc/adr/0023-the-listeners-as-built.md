<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0023: The listeners as built

Status: accepted

## Context

[0012](0012-local-listener-security.md) decided what the local listener has
to hold against, and with what: a loopback bind, a launch token exchanged
for a cookie, a Host allow-list, a same-origin check, a unix-socket listener
for shared hosts and a read-only mode. It gives the unix-socket listener and
the read-only mode one sentence each. It has `--listen` default to
`127.0.0.1:7374`, and the name `localhost` answered once sdash holds its
port on both loopback addresses.

Building these took decisions that 0012 does not hold: what the default
binds, where a socket may lie and how it gets its mode, what a listener
without a port answers to, and what "sends nothing that changes the
cluster" means for a request. This record is where they are read in one
place. The code that keeps them is in `internal/server`, `internal/cli` and
`cmd/sdash`.

0012 is not edited and stays accepted. This record adds to it and differs
from it in one sentence, the default of `--listen`.

## Decision

The listener on TCP:

- `--listen` defaults to `localhost:7374`, not to `127.0.0.1:7374`. The name
  `localhost` stands for the two literal addresses `127.0.0.1` and `::1`.
  Both are bound, on one port number, and served by one handler. No
  resolver is asked what the name means.
- The two fall back together. When the port is taken on either address,
  neither is kept: sdash binds a port that is free on both, in at most 16
  tries, and logs a warning that names the port it wanted and the one it
  took. For port 0 the second address takes the number the system chose for
  the first.
- The name `localhost` is answered in the Host header only while sdash
  holds one port on both addresses, as 0012 has it. For the name, the
  address sdash prints and opens is that of `127.0.0.1`, with both
  addresses held or with that one alone.
- A host without an IPv6 loopback address, where binding `::1` fails with
  `EADDRNOTAVAIL` or `EAFNOSUPPORT`, is served on `127.0.0.1` alone, and the
  name `localhost` is refused there. This is logged at info level, not as a
  warning. A failure on `::1` that is neither this nor a port in use gives
  up `127.0.0.1` as well and ends sdash with the error.
- A literal address, `127.0.0.1:PORT` or `[::1]:PORT`, binds that address
  alone, falls back to a free port on it, and is not answered under the
  name `localhost`.
- When one of two listeners fails while serving, the other is closed and
  sdash ends with the error.

The listener on a unix socket:

- `--listen unix:PATH` listens on a socket at PATH and binds no port. A
  relative PATH is taken from the working directory and made absolute. A
  PATH that begins with `~` is a usage error: the shell does not expand it
  behind `unix:`.
- `--listen unix:` alone is `$XDG_RUNTIME_DIR/sdash/sdash.sock`. Without
  that variable it is a usage error, and so it is with a relative path in
  the variable, which the XDG Base Directory specification has ignored.
- A path longer than a socket address takes, 107 bytes on Linux and 103 on
  macOS, is refused with its own length and that limit in the message, and
  so is one whose directory leaves no room for the staging name below. The
  path as it was given is checked before anything is created, and the path
  its symbolic links lead to as soon as that is known.
- Directories that are missing on the way are created with the mode 0700.
  Symbolic links on the way to the socket's directory are resolved first.
  The checks apply to where they lead, and the socket is bound and reported
  under the path without them.
- The directory of the socket has to belong to the user, and neither its
  group nor everyone may write to it. Every directory above it, up to the
  root, has to belong to the user or to root, and neither its group nor
  everyone may write to it unless it has the sticky bit. A path that fails
  this is refused, with the directory and the reason in the message.
- The socket has the mode 0600 from the moment it exists under its name.
  sdash makes a staging directory of the mode 0700 inside the socket's
  directory, named `.sd` and five random characters, binds the socket in it
  under the name `s`, sets the mode there, renames the socket into its
  place and removes the staging directory. The umask is not touched.
- A socket that is already at the path is replaced, by that rename, when a
  connection to it is refused: it is what a killed sdash left behind. One
  that accepts a connection belongs to a running sdash and is not taken,
  and one that neither accepts nor refuses is not taken either. What is at
  the path and is no socket, a symbolic link included, is neither replaced
  nor removed.
- When the listener closes it removes the socket, but only while the file
  at the path is still the one it bound.
- sdash on a socket opens no browser. It prints the path of the socket,
  the command `ssh -L 7374:PATH HOST` to run on the user's own machine, and
  the address `http://127.0.0.1:7374/?token=...` to open there. PATH is
  quoted for a shell where it needs to be, HOST is the name of the machine
  or `<this host>`, and the port is a suggestion that the text says can be
  changed.
- For a PATH that holds a colon, a backslash, a percent sign or `${` no
  command is printed. The argument of `ssh -L` reads a colon as the end of
  one of its parts, removes a backslash as the mark of an escape, and
  expands a percent sign as a token and `${NAME}` as an environment
  variable. sdash says that the path cannot be given to `ssh -L` as it is,
  names what it holds, and prints the address all the same.

The names a listener answers to, and the cookie:

- A listener on a socket has no port of its own. Its Host allow-list is the
  three loopback names, `localhost`, `127.0.0.1` and `[::1]`, with any port
  number or with none.
- The session cookie is named `sdash_session_PORT` after the port in the
  Host header of the request, 80 where the header names none. That holds
  for both kinds of listener; the name is not taken from a port sdash is
  bound to.

`--dev`:

- `--dev` relaxes the same-origin check and nothing else: the two origins
  of the Vite dev server, `http://127.0.0.1:5173` and
  `http://localhost:5173`, pass it. Nothing is added to the Host allow-list,
  and no CORS header is sent, with `--dev` or without.
- The proxy of the Vite dev server is set to name sdash by sdash's own
  address in the Host header, as a browser does that goes there directly.

Read-only:

- With `--read-only`, every request under `/api` whose method is not GET,
  HEAD or OPTIONS is refused with the status 403 and the error code
  `read_only`. The check stands in front of the API handler, after the
  same-origin and session checks.
- The method alone decides. That rests on a rule of the browser API, which
  `api/openapi.yaml` states: no operation that changes anything, on a
  cluster or in sdash, is a GET, whatever slurmrestd uses for it.

Stopping:

- SIGHUP stops sdash as SIGINT and SIGTERM do
  ([0020](0020-go-lines-tools-and-libraries.md)): a clean shutdown, the
  socket removed, exit 0. A sdash that was started with SIGHUP ignored, as
  under `nohup`, leaves it ignored.

## Why

- A browser asked for `localhost` tries `::1` before `127.0.0.1`. Only a
  sdash that holds its port on both can answer to the name without the risk
  0012 describes, so holding both is the default, and half of `localhost`
  on a port is never kept.
- The printed address keeps the literal form because it leads to sdash
  whatever a resolver makes of the name.
- Many cluster nodes and containers have no IPv6 loopback address, and
  sdash has to start there. The address it prints works, so there is
  nothing to warn about.
- The forward in front of a socket opens the path anew for every
  connection. Whoever can rename the socket, or a directory above it, can
  put a listener of their own under its name at any time and is handed the
  launch token. Hence the rules for the directories, and the path without
  links. The sticky bit is what lets a directory of the user's lie in
  `/tmp`.
- Binding the socket in its place and changing the mode afterwards would
  leave it open, for a moment, to whomever the umask lets in. Setting the
  umask for the bind would close that window too, but the umask belongs to
  the whole process, and the server sets nothing that does.
- A killed sdash must not keep the next one from starting, and a running
  one must not be cut off from its forwards. The user may also remove a
  socket and start another sdash on the path, and the first must not take
  the second's file with it.
- The loopback names under any port are enough for what the Host check is
  there for. A browser never connects to the socket. It connects to the TCP
  port of the forward, on the user's own machine, and names that port,
  which the user chose and sdash never learns. What the allow-list still
  stops is a page that reaches that port under another name, which is DNS
  rebinding: such a page names its own domain, and no domain is among the
  three names. Another process on that machine can connect to the port and
  name it as the browser does. It is stopped by what it lacks, the token of
  the launch, as on a TCP listener.
- A browser keeps cookies by host name and ignores the port. With the port
  of the request in the cookie's name, two sdash behind two forwards on one
  machine keep their cookies apart, as two on two ports do. On TCP the port
  in the header is the bound one, since the allow-list lets nothing else
  through.
- The proxy of the Vite dev server forwards the browser's `Origin` header
  unchanged. Once it names sdash by sdash's own address, that header is the
  only one that still names the dev server, so it is the only check `--dev`
  has to relax, and the Host allow-list and the cookie's name work as they
  do without it.
- The read-only check stands in front of the handler and not in each
  operation, so that an operation added later is covered without anybody
  having to remember the mode. It comes after the session check, so that a
  request without a session is answered as in every mode and learns nothing
  about this one.
- On a shared host sdash runs in an ssh session, and the ordinary end of it
  is that the session closes. Left to its default action, the hangup would
  end the process before it has removed its socket.

## Costs

- The default of `--listen` is no longer the one 0012 names. On that
  sentence the code follows a record that is not accepted yet and leaves one
  that is.
- With the default, a port that is taken on `::1` alone moves sdash off
  7374 although `127.0.0.1:7374` was free. Whoever wants that port names
  `127.0.0.1:7374` and does without the name `localhost`.
- Left open: two sdash started on one socket path at the same moment both
  find it free. The later rename replaces the earlier socket, and the
  earlier sdash goes on serving a socket that has no name and that no
  forward reaches, without noticing. Nothing locks the path.
- Left open: in a user namespace without root, such as a sandbox that maps
  the user alone, no directory belongs to id 0. The kernel shows every owner
  the namespace has no id for under one overflow id, and sdash accepts that
  id as the system's there. A directory of another user of the host appears
  under the same id, so above the socket's directory the mode is checked
  and the owner, in effect, is not.
- Left open: a sdash that is killed between making its staging directory
  and removing it leaves the directory behind, empty or with a socket in it
  that nobody listens on. No later start removes it.
- Left open: a request whose method the router does not know is answered
  by the router with a bare 405, before the checks under `/api`. It carries
  no JSON error and, in read-only mode, not the code `read_only`. It does
  not reach the API.
- Left open: the tests of the path that binds both families bind real
  addresses, and fail on a machine without an IPv6 loopback address. What
  sdash does without one is tested against a fake
  ([testing.md](../testing.md)).
- The forward ends in a TCP port on the user's own machine, which sdash
  does not see. It cannot tell whether that machine is shared, in which
  case 0012's costs of a loopback port hold for the forward, or whether the
  name `localhost` leads to the forward on both addresses there. It answers
  to the name all the same, and prints `127.0.0.1`.
- A listener on a socket answers to every port, so its Host check no
  longer tells one sdash from another. The token does.
- A socket path that `ssh -L` would misread gets no command to copy, and
  `unix:` alone is a usage error where there is no runtime directory, as on
  macOS.
- The read-only mode is as good as the rule it rests on. An operation that
  changed something on a GET would pass the check, so the rule is what a
  review of a new operation holds it to.
- A sdash that is meant to outlive its terminal has to be started with the
  hangup ignored, as `nohup` does. The tests of the hangup fail when they
  are run that way themselves, since the process under test inherits it.
