// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { QueryClient } from "@tanstack/react-query";

/**
 * Makes the store of what the interface has fetched from the server: one
 * for the application, and a fresh one for each test
 * (TanStack Query, doc/adr/0013-frontend-stack.md).
 *
 * A request that fails is not sent again by itself. The server is a process
 * on the same machine, so a request fails because sdash refused it or
 * because sdash has stopped, and neither changes by asking again a second
 * later. The view says what went wrong at once, and the library asks again
 * when the user comes back to the tab.
 *
 * A request is sent whatever the browser says about the network. The
 * library's default holds requests back while the browser reports itself
 * offline, as after a lost Wi-Fi or a changed VPN, and a loopback address
 * is reached without any network.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "always" },
      mutations: { networkMode: "always" },
    },
  });
}
