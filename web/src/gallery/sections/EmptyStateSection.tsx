// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Button } from "../../primitives/Button";
import { Card } from "../../primitives/Card";
import { EmptyState } from "../../primitives/EmptyState";
import { Example, Section } from "../Section";

/** An empty state in a card, with and without an action, and on the page. */
export function EmptyStateSection() {
  return (
    <Section id="empty-state">
      <Example title="In a card, with an action" on="page">
        <Card title="Example list" level={3} className="w-full max-w-120">
          <EmptyState
            title="Nothing matches these filters."
            action={<Button size="sm">Clear the filters</Button>}
          >
            Clear a filter to see more.
          </EmptyState>
        </Card>
      </Example>
      <Example title="On the page, as a heading" on="page">
        <EmptyState title="Nothing here yet" level={3} className="w-full">
          Something will show here once there is something to show.
        </EmptyState>
      </Example>
    </Section>
  );
}
