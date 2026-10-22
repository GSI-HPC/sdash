<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0025: go-clikit for the command line

Status: accepted

## Context

[0020](0020-go-lines-tools-and-libraries.md) took the command line from
clusterctl and sind: `internal/exitcode`, a walk over the command tree that
wraps every argument check, and the reading of the build info. GSI-HPC's
tools share that code in the module `github.com/GSI-HPC/go-clikit`, and the
copies in sdash have drifted from it. The kit also reads the build info the
way `0019-version-in-a-signed-tag` asks, and its texts for command line
errors are an interface its other users compare in tests.

## Decision

- **Requirement.** sdash requires `github.com/GSI-HPC/go-clikit`, and
  imports `cobratree` and `termtext` from it. It does not import the
  packages for progress yet, because it has no run to report.
- **Command tree.** `cobratree.Strict` makes the tree strict, so that a
  word that names no command, a bad argument and a flag that cannot be
  parsed are usage errors. `cobratree.IsUsage` tells them from a failure,
  and `cobratree.Usagef` marks the error of `--listen`.
- **Exit codes.** `internal/exitcode` is deleted. Its three constants,
  0, 1 and 2, stay in `internal/cli`, the one place that meets the process,
  with the meaning they had. This replaces the bullet of
  [0020](0020-go-lines-tools-and-libraries.md) on exit codes, and the
  codes stay as they were.
- **Build info.** `internal/version` reads the build info with
  `cobratree.ReadBuildInfo`. What it adds is the release build's values
  from the signed tag, `devel`, and the rendering.
- **The error line.** The error that ends a command is escaped with
  `termtext.Escape` before it is written, since it can quote what the user
  typed or the system returned.

## Why

- One copy of the strict tree and the build info is fixed once for all four
  tools.
- A usage error that is a type, not a number, cannot lose its meaning
  between the place it is made and the place the exit code is chosen.
- Escaping in one place keeps a character that acts on a terminal out of
  the message, whatever package made it.

## Cost

- The error of a command that holds no subcommands now ends with its usage
  line, as the kit words it: `unknown command "extra" for "sdash version"
  (usage: sdash version)`.
- A change to the texts of the kit's errors is a breaking change of the
  kit, so sdash upgrades it on purpose, with its tests.
