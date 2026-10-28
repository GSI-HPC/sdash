// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { PageHeader } from "../layout/PageHeader";
import { type ViewId, viewOf } from "../routing/views";
import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";
import { WithCluster } from "./WithCluster";

/**
 * A view before it is built: the page header with the view's title and the
 * line of the view table that says what it will show, and a card that says
 * why it shows nothing: that no cluster is configured, or else that the
 * view is not built yet. A view that is built replaces it in its own file
 * under views/.
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
      <WithCluster>
        {() => (
          <Card className="max-w-140">
            <EmptyState title="Not built yet" level={2}>
              This view does not show the data of a cluster yet.
            </EmptyState>
          </Card>
        )}
      </WithCluster>
      {children}
    </div>
  );
}
