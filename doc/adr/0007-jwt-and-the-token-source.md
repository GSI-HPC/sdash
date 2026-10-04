<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0007: JWT, and where the token comes from

Status: accepted

## Context

slurmrestd has two authentication plugins
([research/slurmrestd.md](../research/slurmrestd.md#2-authentication-and-identity)).
With `rest_auth/jwt` the client sends a token; slurmrestd forwards it and
slurmctld and slurmdbd validate it, and the request runs as the user the
token names. With `rest_auth/local` a unix socket identifies its peer. The
first architecture position kept both open.

A user gets a token from `scontrol token`, valid for 1800 seconds unless a
lifespan is asked for. A site can cap the lifespan, turn token creation off
for users, or accept tokens of an external identity provider instead.

## Decision

- sdash authenticates to slurmrestd with a JWT (`rest_auth/jwt`).
- The token comes from a token command when the cluster's profile
  configures one (the suggested command is
  `ssh <host> scontrol token lifespan=<n>`), and otherwise from an
  environment variable or a file.
- Tokens are kept in memory. They are never written to the profile and
  never reach the browser.

## Why

- The request runs as the user in the token, which is what makes sdash act
  under the user's own identity
  ([0001](0001-local-first-binary-with-embedded-ui.md)).
- A command covers the sites that issue tokens in another way, without
  sdash knowing each of them.
- The browser talks only to sdash. A token that never leaves the Go process
  cannot be read by a script in the page.

## Costs

- A token expires. sdash has to run the command again in time, and a token
  from a variable or a file is not renewed at all: when it expires the user
  supplies a new one.
- A lifespan above the site's cap is rejected, not shortened, and a site
  that turns token creation off leaves the suggested command useless.
- The token command is a command sdash executes, so a profile is as trusted
  as a script. [0012](0012-local-listener-security.md) has it set in the
  profile file only.
- slurmrestd has no "who am I". The user name comes from the token's claim
  or from the profile.
- An expired token does not look the same everywhere: HTTP 511 on
  `/slurm/*` and, by source, 502 on `/slurmdb/*`. A successful version
  discovery does not prove the token works.
- A slurmrestd that offers only `rest_auth/local` cannot be used.
