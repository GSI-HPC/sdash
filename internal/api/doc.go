// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package api is the Go side of sdash's browser API as api/openapi.yaml
// defines it: the types of its schemas, the routing of its operations, and
// the interface a server implements to answer them.
//
// It exists so that the server and the user interface cannot drift apart.
// Both are generated from the one document
// (doc/adr/0011-openapi-first-browser-api.md), and an operation is
// implemented against StrictServerInterface, whose methods can return only
// the answers the document declares. The implementation lives in
// internal/server, which also decides who may call it; this package holds no
// behaviour of sdash's own.
//
// Everything here except this file is generated and committed. To change the
// API, edit api/openapi.yaml and run "make generate" in the root of the
// checkout. It rewrites api.gen.go here and the TypeScript types in
// web/src/api/, and the three files are committed together; CI regenerates
// them and fails on a difference. There is no go:generate line on purpose:
// "go generate" would rewrite the Go side alone and leave the TypeScript
// side behind, and the release of the generator is pinned in one place, the
// Makefile, with its settings in api/oapi-codegen.yaml.
package api
