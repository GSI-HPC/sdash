// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "@hey-api/openapi-ts";

// How "npm run generate", which "make generate" calls, turns
// api/openapi.yaml into the TypeScript side of the browser API
// (doc/adr/0011-openapi-first-browser-api.md).
//
// The generator is @hey-api/openapi-ts, at the exact release
// package-lock.json holds: it is a 0.x package, and a new release may write
// the same types differently. openapi-typescript, the more usual choice,
// accepts TypeScript 5 only as its peer and so does not install beside
// TypeScript 6.
//
// package.json overrides one dependency of the generator: it asks for
// js-yaml 4.2.0 exactly, which has known denial-of-service flaws in how it
// reads YAML, and gets 4.3.2, the release of the same line that mends them.
// The generator reads no YAML but sdash's own, so this is for a clean
// "npm audit" and not against a threat; the override goes when the generator
// asks for a mended release itself.
export default defineConfig({
  input: "../api/openapi.yaml",

  output: {
    // The directory holds generated files and nothing else: the generator
    // empties it on every run, and ESLint and Prettier leave it alone.
    path: "src/api",
    // No index.ts that exports everything again: with one generated file
    // there is nothing to gather, and the name would not say that the file
    // is generated.
    entryFile: false,
    // Every file states its copyright and licence in its first two lines
    // (doc/adr/0002-apache-2-0-and-reuse.md), a generated one included. The
    // generator's own line, which says that the file is generated, follows.
    //
    // The two lines stand here as text for another file. The comments
    // around them keep the reuse tool from reading them as a second, broken
    // statement about this one.
    // REUSE-IgnoreStart
    header: ({ defaultValue }) => [
      "// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>",
      "// SPDX-License-Identifier: Apache-2.0",
      "",
      ...defaultValue,
    ],
    // REUSE-IgnoreEnd
  },

  // The types alone: of the schemas, and of the request and the answers of
  // each operation. The generator can also write the functions that call
  // the operations, but they come with a copy of its HTTP client, some two
  // thousand lines of somebody else's code under another licence. The
  // client is written here instead, against these types (src/client).
  plugins: [
    {
      name: "@hey-api/typescript",
      // The values of an enum as an object beside the type, so that the
      // client can tell at run time whether a value it received is one the
      // document names.
      enums: "javascript",
    },
  ],

  // A run that fails says why on the terminal; it does not also leave a log
  // file in the working directory.
  logs: { file: false },
});
