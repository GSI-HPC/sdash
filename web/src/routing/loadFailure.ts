// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// How a browser words the failure of a dynamic import whose file it could
// not fetch. No engine gives it a class or a code of its own: it is a
// TypeError, and the three engines behind the supported browsers
// (doc/adr/0014-accessibility-and-browsers.md) say
//
//   Chromium  Failed to fetch dynamically imported module: <address>
//   Firefox   error loading dynamically imported module: <address>
//   WebKit    Importing a module script failed.
const importFailed = /dynamically imported module|module script/i;

/**
 * Whether an error says that the file of a view could not be fetched, as
 * opposed to a view that was loaded and then failed. The two have
 * different causes and different ways out, so the user is told different
 * things (ViewBoundary.tsx).
 *
 * It goes by the wording, which an engine may change. An error that is no
 * longer recognised is reported as a view that failed, the more cautious
 * of the two texts.
 */
export function isLoadFailure(error: unknown): boolean {
  return error instanceof TypeError && importFailed.test(error.message);
}
