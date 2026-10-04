<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0008: Every upstream request names sdash and its version

Status: accepted

## Context

sdash runs on its users' machines
([0001](0001-local-first-binary-with-embedded-ui.md)), so the site that
operates slurmrestd does not see which versions of it are in use. They are
meant to be visible on the slurmrestd side.

## Decision

Every request sdash sends to slurmrestd carries

```
User-Agent: sdash/<version> (<os>/<arch>)
```

- The version is the one the build was stamped with
  ([0019](0019-version-in-a-signed-tag.md)), the same that `sdash version`
  prints.
- The header carries the version, the operating system and the
  architecture, and nothing about the user or the machine.

## Costs

- slurmrestd does not log it. Its normal request line has the method and
  the path only, and it logs request headers only under its `NET` debug
  flag, which logs the token header as well
  ([initial-conclusions.md](../initial-conclusions.md#11-open-questions)).
- The version is therefore visible on the server side only through the
  access log of a proxy in front of slurmrestd, or through a similar change
  on the site's side. Where there is none, this decision shows nothing.
- The header tells the site which operating system and architecture a user
  runs sdash on.
