// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Card } from "../../primitives/Card";
import { Skeleton } from "../../primitives/Skeleton";
import { Example, Section } from "../Section";

/** A skeleton in a card, and one of a single line. */
export function SkeletonSection() {
  return (
    <Section id="skeleton">
      <Example title="In a card, and one line alone" on="page">
        <Card title="Example on its way" level={3} className="w-full max-w-80">
          <Skeleton label="Loading the example" />
        </Card>
        <Card className="w-full max-w-80">
          <Skeleton lines={1} />
        </Card>
      </Example>
    </Section>
  );
}
