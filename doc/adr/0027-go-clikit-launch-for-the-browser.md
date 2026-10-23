<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0027: go-clikit's launch for the browser

Status: accepted

## Context

sdash opens the browser on a file, never on the address, so that the launch
token is not in an argument list that every user of the host can read
([0012](0012-local-listener-security.md)). That code was `internal/browser`.
go-clikit v0.9.0 has it in `localweb/launch`, written from sdash's opener and
from the openers of sind and brig (decision 35 of go-clikit). The rest of
that release is not sdash's: `localweb/assets` and `localweb/page` serve
files by a hash and Go templates, and `localweb/htmx` carries htmx, while
sdash serves a React page that Vite names and hashes itself.

## Decision

- **Requirement.** sdash requires go-clikit v0.9.0 and imports
  `localweb/launch`. `internal/browser` is deleted. `launch` needs
  `golang.org/x/sys`, which sdash now requires as an indirect module.
- **Opener.** `Process.Browser` is a `launch.Opener` named `sdash`. Its
  `Dir` is set when the browser is opened, to `sdash` below the user's cache
  directory, which sdash makes and closes to other users first. The cache
  directory, the redirect file's name `open-PORT.html` and the page it holds
  are what they were, and so is the rule of when no browser is opened.
  `Detached` starts the opener, in a session of its own, as before.
- **Not adopted.** `localweb/assets`, `localweb/page` and `localweb/htmx`
  have no counterpart in sdash. `launch.Acquire` and `Instance`, which keep
  one server per user, are not in sdash either, and taking them would change
  what a second start does. That is left to a decision of its own.

## Why

- A flaw in the way the token reaches the browser is fixed once, in the kit,
  for every tool that opens one.
- The redirect file is written under a temporary name and renamed into
  place, so a reader never finds it half written, and the kit checks that
  its directory is the user's and closed to other users.

## Costs

- A cache directory `sdash` that another user owns, or that cannot be closed
  to other users, gives a warning and no browser, where `internal/browser`
  failed on the same cases with another text. The server runs in both.
- The words of the warning when the opener fails come from the kit.
- One more indirect module, `golang.org/x/sys`.
