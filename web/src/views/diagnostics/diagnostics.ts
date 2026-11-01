// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the Diagnostics view and the Overview's scheduler card say of the
// figures of slurmctld: a time of a cycle in the unit that fits it, a count
// with separators. Nothing here renders.

import type { DiagnosticsRpc } from "../../client/client";

const british = new Intl.NumberFormat("en-GB");

/** A count in words, with the separators of British English. */
export function count(value: number): string {
  return british.format(value);
}

/**
 * A time slurmctld gives in microseconds, in the unit that fits it, with
 * at most one decimal: "850 µs", "1.2 ms", "3.4 s".
 */
export function micros(value: number): string {
  if (value < 1_000) {
    return `${count(value)} µs`;
  }
  if (value < 1_000_000) {
    return `${trim(value / 1_000)} ms`;
  }
  return `${trim(value / 1_000_000)} s`;
}

function trim(value: number): string {
  return british.format(Math.round(value * 10) / 10);
}

/**
 * The share of the busiest row that a row of RPCs has, between 0 and 1;
 * 0 where no row had a call.
 */
export function shareOfBusiest(
  row: DiagnosticsRpc,
  rows: readonly DiagnosticsRpc[],
): number {
  const busiest = Math.max(0, ...rows.map((each) => each.count));
  return busiest === 0 ? 0 : row.count / busiest;
}
