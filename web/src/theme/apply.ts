// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Sets the theme before the application renders. index.html loads this
// module ahead of the application, so the first render already has the
// right tokens.
//
// It is a module of its own and not a few lines inside index.html because
// the server's Content-Security-Policy allows no inline script
// (doc/adr/0012-local-listener-security.md). The price: a module runs after
// the page is parsed, so a browser may paint once before the theme is known.
// styles/index.css says what it paints then.

import { applyInitialTheme } from "./theme";

applyInitialTheme();
