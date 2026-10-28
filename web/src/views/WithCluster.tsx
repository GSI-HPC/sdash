// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { useCluster } from "../cluster/useCluster";
import { Card } from "../primitives/Card";
import { EmptyState } from "../primitives/EmptyState";
import { ErrorPanel } from "../primitives/ErrorPanel";
import { Skeleton } from "../primitives/Skeleton";
import { NoCluster } from "./NoCluster";

/**
 * What a view of cluster data shows below its header: its content for
 * the cluster the address chooses, or one card that says why there is
 * none to show. The card is the same in every view, and holds nothing
 * else, so that its title is the heading the view's content starts with.
 */
export function WithCluster({
  children,
}: {
  /** The content of the view for the cluster of the name. */
  children: (cluster: string) => ReactNode;
}) {
  const choice = useCluster();

  switch (choice.kind) {
    case "pending":
      return (
        <Card className="max-w-140">
          <Skeleton label="Loading the clusters" lines={2} />
        </Card>
      );
    case "failed":
      return (
        <Card className="max-w-140">
          <ErrorPanel
            title="sdash did not say which clusters it serves."
            level={2}
            code={choice.error.message}
          >
            Without that, this view has no cluster to show.
          </ErrorPanel>
        </Card>
      );
    case "none":
      return <NoCluster />;
    case "unknown":
      return (
        <Card className="max-w-140">
          <EmptyState title={`No cluster named ${choice.name}`} level={2}>
            {`The address names a cluster the profile file does not. It names ${choice.known.join(", ")}.`}
          </EmptyState>
        </Card>
      );
    case "chosen":
      return children(choice.name);
  }
}
