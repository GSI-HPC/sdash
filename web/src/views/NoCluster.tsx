// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

/**
 * What a view of cluster data shows while sdash has no cluster to ask: one
 * card, the same in every view. It says what is missing and makes no
 * promise about how a cluster is configured, which is not decided yet
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 */
export function NoCluster() {
  return (
    <section className="max-w-140 rounded-lg border border-bd bg-surface px-4 py-3.5 shadow-sm">
      <h2 className="text-[0.84375rem] font-semibold">No cluster configured</h2>
      <p className="mt-1 text-t2">
        No cluster is configured yet, and this view needs one before it has
        anything to show.
      </p>
    </section>
  );
}
