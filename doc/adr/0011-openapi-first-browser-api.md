<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0011: The browser API is written as an OpenAPI document first

Status: accepted

## Context

sdash is two programs in two languages that ship in one binary: a Go server
and a React app, with an HTTP API of sdash's own between them. Each side
needs the shapes of that API as types. The first architecture position
generated the TypeScript types from the Go structs and checked them against
golden responses
([initial-conclusions.md](../initial-conclusions.md#8-frontend)).

This is not the upstream API. Towards slurmrestd sdash generates nothing
([0009](0009-one-tolerant-wire-model.md)).

## Decision

- One OpenAPI document, `api/openapi.yaml` (OpenAPI 3.0.3, base path
  `/api/v1`), is the source of sdash's browser API.
- The Go server stubs in `internal/api/` and the TypeScript types in
  `web/src/api/` are generated from it. `make generate` regenerates both.
- The generated code is committed. CI regenerates it and fails on a
  difference, as it does for `go mod tidy`.
- The calls are written by hand in `web/src/client/` against those types,
  one function per operation, because the generator's own client would
  commit about 2,000 lines of third-party code. The frontend calls the API
  through that client only.

This replaces the sentence of the first position that derives the TypeScript
types from Go structs.

## Why

- Neither side is the source of the other. A change to the API is a change
  to one document, which a reviewer can read without the code on either
  side.
- With the generated code in the tree, `go build`, the linter and
  govulncheck work on a plain checkout, without Node and without a
  generator.
- What speaks against generating upstream does not apply here: this API has
  one version, sdash writes its document itself, and both ends are released
  together.

## Costs

- A change to the API is four changes in one commit: the document, the
  generated Go, the generated TypeScript types and the hand-written function
  in `web/src/client/`.
- Only the types are checked against the document. That a function asks the
  right path with the right method is checked by its tests, not by the
  compiler.
- Generated files are in every diff that touches the API, and they are kept
  out of lint.
- The generators are tools to pin and to update, and the generated server
  is tied to chi, one of the Go requirements
  ([0020](0020-go-lines-tools-and-libraries.md)). A new generator release
  can rewrite generated files that no change to the API touched.
- The document can say only what OpenAPI 3.0.3 and both generators
  support.
