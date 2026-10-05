// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The keys of the shell's own shortcuts, the ones the design handoff names
// (doc/design/README.md, "Interactions, keys, motion"). They are named here
// because each is used twice: where the shortcut is registered, and on the
// control that shows it.

import type { View } from "../routing/views";

/** The keys of each shortcut, as shortcuts/keys.ts reads them. */
export const shellKeys = {
  palette: "mod+k",
  help: "?",
  theme: "t",
  sidebar: "[",
  close: "Escape",
} as const;

/** The first key of the sequences that go to a view. */
export const goPrefix = "g";

/** The keys that go to a view: "g" and then the view's letter. */
export function goKeys(view: View): string {
  return `${goPrefix} ${view.goKey}`;
}
