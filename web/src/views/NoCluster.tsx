// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";

/**
 * What a view of cluster data shows while sdash has no cluster to ask: one
 * card, the same in every view. It says what is missing and makes no
 * promise about how a cluster is configured, which is not decided yet
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md). The card holds nothing else,
 * so the empty state's title is the heading the view's content starts
 * with.
 */
export function NoCluster() {
  return (
    <Card className="max-w-140">
      <EmptyState title="No cluster configured" level={2}>
        No cluster is configured yet, and this view needs one before it has
        anything to show.
      </EmptyState>
    </Card>
  );
}
