// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { ScopeContext } from "./context";

/**
 * Puts the shortcuts of everything inside it into a scope: "view" around
 * the view that shows, "overlay" around the content of a dialog. A
 * component never names its scope, so it cannot name the wrong one. Both
 * scopes are set in one place each, the shell and the dialog component.
 *
 * The scope says whose a shortcut is. That a dialog is open over the page
 * is said by the dialog itself, with useOverlayOpen: its content can stay
 * mounted for a moment after it has closed.
 */
export function ShortcutScope({
  scope,
  children,
}: {
  scope: "view" | "overlay";
  children: ReactNode;
}) {
  return <ScopeContext value={scope}>{children}</ScopeContext>;
}
