// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The user's preferences that outlive a page: the theme, the state of the
// sidebar, whether single-key shortcuts are on. They are kept in the
// browser's localStorage and nowhere else. A browser may refuse access to it
// altogether, for example when site data is blocked, and then throws; the
// page must still come up and work, so both functions swallow that.

/**
 * Reads what is stored under a key. Null when nothing is, and when the
 * browser refuses, which counts as no choice. The value is whatever was
 * written there, by this build, by a later one or by other code on the same
 * origin: the caller checks it before believing it.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Keeps a value for the next visit. When the browser refuses, the choice
 * still holds for this page and is only forgotten afterwards, so the error
 * is dropped.
 */
export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Dropped on purpose; see above.
  }
}
