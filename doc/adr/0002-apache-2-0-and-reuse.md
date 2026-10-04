<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0002: Apache-2.0, REUSE, and GSI holds the copyright

Status: accepted

## Context

sdash started without a licence file and without a copyright line in any
file. It takes build files, scripts and conventions from four sibling
repositories of GSI: [sind](https://github.com/GSI-HPC/sind) and
[clusterctl](https://github.com/GSI-HPC/clusterctl) are LGPL-3.0-or-later,
[go-clikit](https://github.com/GSI-HPC/go-clikit) and
[go-nodeset](https://github.com/GSI-HPC/go-nodeset) are Apache-2.0. Its
binary embeds code that is not GSI's: Go modules, npm packages and fonts.

## Decision

sdash is licensed under the Apache License, Version 2.0: code, documentation
and design. GSI Helmholtz Centre for Heavy Ion Research GmbH
<http://www.gsi.de> holds the copyright.

- `LICENSE` holds the licence text verbatim, so that GitHub recognises it,
  and `LICENSES/Apache-2.0.txt` holds it again for the REUSE specification.
  There is no `NOTICE` file.
- Every file that can hold a comment starts with `SPDX-FileCopyrightText`
  and `SPDX-License-Identifier` in its own comment style: after a shebang,
  after the front matter of a `SKILL.md`, after the doctype in HTML. A file
  that cannot is annotated in `REUSE.toml`, where a file GSI did not write
  keeps its own holder and licence. `reuse lint` checks this in CI.
- The year is 2026, when the work was first written, and it is not moved
  forward.
- There is no DCO and no CLA for now.
- A release carries a listing of the third-party licences of what the binary
  embeds (Go modules, npm packages, fonts). It is generated at the release
  build and shipped in the archive ([0019](0019-version-in-a-signed-tag.md));
  none of it is committed.

## Why Apache-2.0

- It grants a licence to every patent a contributor holds that the
  contribution uses, and ends that licence for anyone who sues over one.
  MIT and BSD-3-Clause say nothing about patents.
- It is compatible with LGPL-3.0 and GPL-3.0, so code written here can move
  into sind and clusterctl, and it is the licence of the two newer siblings.

## Moving code in

GSI holds the copyright of sind and clusterctl, so it can license a copy of
their files under Apache-2.0. The commit that moves a file changes its
`SPDX-License-Identifier` line, and a comment that says where the file comes
from reads `Adapted from GSI-HPC/<repo> <path>.` The code keeps its
LGPL-3.0-or-later licence in the history of the repository it comes from.
Nothing is ported from Radar
([0001](0001-local-first-binary-with-embedded-ui.md)).

## Costs

- Apache-2.0 does not oblige anyone to publish their changes to sdash, which
  the LGPL of sind and clusterctl does for theirs.
- A redistributor keeps the copyright and licence notices of every file.
- A contributor from outside GSI keeps the copyright of their contribution
  and licenses it under Apache-2.0 (section 5); a file they change then
  names them in an `SPDX-FileCopyrightText` line of their own. Changing the
  licence later needs their agreement.
- Without a DCO or a CLA, the pull request is the only record that a
  contributor offered their work under the licence.
- A new file without the two lines, or without an annotation, fails CI.
