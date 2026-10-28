// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { HealthTone } from "../cluster/health";

// The classes of each tone a pill can have: its border and background, its
// text and its light. A tone with a meaning lies on its tint, as a badge
// does, with the text in --t1 and the light in the tone's -fg, which hold
// 4.5:1 and 3:1 where the tone's own text colour does not
// (doc/ui.md, "Colours").
const tones = {
  neutral: {
    pill: "border-bd bg-surface text-t2",
    light: "bg-(--t4)",
  },
  ok: {
    pill: "border-transparent bg-ok-bg text-t1",
    light: "bg-ok-fg",
  },
  warn: {
    pill: "border-transparent bg-warn-bg text-t1",
    light: "bg-warn-fg",
  },
  err: {
    pill: "border-transparent bg-err-bg text-t1",
    light: "bg-err-fg",
  },
} as const satisfies Record<HealthTone, { pill: string; light: string }>;

/** The tone of a status pill. */
export type PillTone = keyof typeof tones;

/**
 * The pill beside the name in the header: a small light and a word for the
 * state of the cluster the page shows. The word carries the state; the
 * light only repeats it in colour, and assistive technology skips it.
 */
export function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  return (
    <span
      className={`flex h-6 shrink-0 items-center gap-1.5 rounded-xl border pr-2 pl-1.75 text-[0.6875rem] font-semibold whitespace-nowrap ${tones[tone].pill}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.75 rounded-full ${tones[tone].light}`}
      />
      {label}
    </span>
  );
}
