// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";

/**
 * What a view of cluster data shows while sdash has no cluster to ask: one
 * card, the same in every view, which says where the clusters come from
 * (doc/adr/0033-the-profile-file.md). The card holds nothing else, so the
 * empty state's title is the heading the view's content starts with.
 */
export function NoCluster() {
  return (
    <Card className="max-w-140">
      <EmptyState title="No cluster configured" level={2}>
        The profile file of sdash names no cluster, and this view needs one
        before it has anything to show. sdash reads the file at
        ~/.config/sdash/clusters.toml, or the one --config names; sdash --help
        says what it holds.
      </EmptyState>
    </Card>
  );
}
