// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Suspense } from "react";
import { useLocation } from "react-router";

import { Shell } from "./layout/Shell";
import { PrimitivesProvider } from "./primitives/PrimitivesProvider";
import { AppRoutes } from "./routing/AppRoutes";
import { ArrivalProvider } from "./routing/arrival";
import { ViewBoundary } from "./routing/ViewBoundary";
import { ShortcutsProvider } from "./shortcuts/ShortcutsProvider";

/**
 * The application: the shell, and inside it the view the address names
 * (doc/ui.md describes how the parts work together).
 *
 * It expects a router and the store of fetched data around it. main.tsx
 * gives it the browser's address bar and the application's store; a test
 * gives it an address in memory and a store of its own.
 *
 * A view is loaded when it is first opened. Until it is there the main
 * region stays empty, without a text that says so: the files come from
 * the same machine, and a word that flashes for a moment tells nobody
 * anything. A view that cannot be loaded at all is the boundary's to
 * report.
 *
 * Around the shell is what the primitives need once for the whole
 * application: the toasts and their region, and what keeps Base UI inside
 * the server's Content-Security-Policy (primitives/PrimitivesProvider.tsx).
 * It lies inside the provider of the shortcuts, so that a control it
 * renders itself, in a toast, can show a key.
 */
export function App() {
  const { pathname } = useLocation();

  return (
    <ShortcutsProvider>
      <PrimitivesProvider>
        <ArrivalProvider>
          <Shell>
            <ViewBoundary at={pathname}>
              <Suspense fallback={null}>
                <AppRoutes />
              </Suspense>
            </ViewBoundary>
          </Shell>
        </ArrivalProvider>
      </PrimitivesProvider>
    </ShortcutsProvider>
  );
}
