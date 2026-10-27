// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { StatCard } from "../../primitives/StatCard";
import { Example, Section } from "../Section";

/** A figure with what it is of, with a unit, and with a line below. */
export function StatCardSection() {
  return (
    <Section id="stat-card">
      <Example title="A row of stat cards" on="page">
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          <StatCard
            label="Example figure"
            level={3}
            value="1,024"
            aside="of 2,048"
            detail="Half of the whole"
          />
          <StatCard
            label="Example share"
            level={3}
            value="37"
            unit="%"
            aside="of 100"
          />
        </div>
      </Example>
    </Section>
  );
}
