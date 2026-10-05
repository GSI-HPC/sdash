// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { PageHeader } from "../layout/PageHeader";
import { type ViewId, viewOf } from "../routing/views";
import { NoCluster } from "./NoCluster";

/**
 * A view before it is built: the page header with the view's title and the
 * line of the view table that says what it will show, and the card that
 * says no cluster is configured. Every view of cluster data is this until
 * the Slurm-facing work can start
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md); a view that is built
 * replaces it in its own file under views/.
 *
 * Children follow the card, for what a view can show already.
 */
export function Placeholder({
  view,
  children,
}: {
  view: ViewId;
  children?: ReactNode;
}) {
  const { title, summary } = viewOf(view);

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <NoCluster />
      {children}
    </div>
  );
}
