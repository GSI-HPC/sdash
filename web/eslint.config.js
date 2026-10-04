// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// The lint rules of the frontend (doc/adr/0015-how-tests-are-written.md).
// Formatting is not among them: Prettier owns it, and none of the rule sets
// below has an opinion on layout.
export default defineConfig(
  globalIgnores([
    // Build and test output.
    "dist/",
    "coverage/",
    "test-results/",
    "playwright-report/",
    // Generated from api/openapi.yaml and committed as the generator writes
    // it (doc/adr/0011-openapi-first-browser-api.md). TypeScript still
    // checks it.
    "src/api/",
  ]),

  js.configs.recommended,

  // typescript-eslint's strictest sets, with the rules that need type
  // information: the code base is new, and starting strict costs less than
  // tightening later.
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Types come from the tsconfig that TypeScript itself would pick for
        // a file, so the linter and "tsc --build" agree on them.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      reactHooks.configs.flat.recommended,
      // The accessibility rules that can be checked in the source; the axe
      // scan of the end-to-end tests sees the rendered page
      // (doc/adr/0014-accessibility-and-browsers.md). The plugin is the fork
      // of eslint-plugin-jsx-a11y that es-tooling maintains, because the
      // original does not allow ESLint 10 as its peer.
      jsxA11y.configs.strict,
    ],
  },
);
