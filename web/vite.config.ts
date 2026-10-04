// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// How the frontend is built for the binary and served while it is being
// worked on (doc/adr/0013-frontend-stack.md).
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // URLs from the root in index.html and in the stylesheet. The server
  // answers every address of the application with index.html, so that a
  // reload of a view works. A relative URL would be resolved against the
  // address of the view, and the script asked for at a place where the
  // server has only index.html to give.
  base: "/",

  build: {
    // "make build" copies this directory into the one the binary embeds
    // (doc/adr/0001-local-first-binary-with-embedded-ui.md). Everything but
    // index.html lands in assets/ with a content hash in its name, so the
    // server can let browsers cache it for good.
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    // Vite would otherwise put a small file into the stylesheet as a data:
    // URL. The server's Content-Security-Policy takes fonts from the server
    // itself and from nowhere else, so a font small enough to be inlined
    // would not load (doc/adr/0012-local-listener-security.md).
    assetsInlineLimit: 0,
  },

  server: {
    // The host sdash itself listens on by default, and not "localhost". A
    // browser keeps cookies by host name and ignores the port, so the
    // session cookie it got from http://127.0.0.1:7374 goes along to
    // http://127.0.0.1:5173 and through the proxy below. Under another name
    // for the same machine the API would answer "not signed in".
    host: "127.0.0.1",
    // Fixed, and an error when taken, because "sdash --dev" accepts the
    // dev server on this port and no other.
    port: 5173,
    strictPort: true,
    // The browser talks to Vite only; Vite hands the API calls to a sdash
    // started beside it with --dev on its default address
    // (doc/adr/0012-local-listener-security.md).
    proxy: {
      "/api": "http://127.0.0.1:7374",
    },
  },
});
