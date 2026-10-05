// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The classes of each tone a pill can have: its border and background, its
// text and its light. There is one tone today. The tones of a connection
// that is live, slow or broken arrive with the states that need them, as
// further rows here (doc/adr/0016-e2e-and-fixtures-on-sind.md).
const tones = {
  neutral: {
    pill: "border-bd bg-surface text-t2",
    light: "bg-(--t4)",
  },
} as const;

/** The tone of a status pill. */
export type PillTone = keyof typeof tones;

/**
 * The pill beside the name in the header: a small light and a word for the
 * state of the connection to the cluster. The word carries the state; the
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
