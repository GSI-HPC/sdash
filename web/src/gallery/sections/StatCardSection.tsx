// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Meter } from "../../primitives/Meter";
import { Sparkline } from "../../primitives/Sparkline";
import { StatCard } from "../../primitives/StatCard";
import { Example, Section } from "../Section";

/** A series of plain numbers for the sparkline of a card. */
export const series: readonly number[] = [
  12, 15, 14, 18, 22, 21, 25, 24, 30, 28, 33, 42,
];

/** A figure alone, with a meter, with a sparkline, and past a mark. */
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
          >
            <Meter label="Example share" value={37} layout="bare" size="lg" />
          </StatCard>
          <StatCard
            label="Example series"
            level={3}
            value="42"
            detail="Over the last twelve steps"
          >
            <Sparkline label="Example series" values={series} />
          </StatCard>
          <StatCard
            label="Example past a mark"
            level={3}
            value="94"
            unit="%"
            detail="Past the error mark at 90%"
          >
            <Meter
              label="Example past a mark"
              value={94}
              thresholds={{ warn: 75, err: 90 }}
              layout="bare"
              size="lg"
            />
          </StatCard>
        </div>
      </Example>
    </Section>
  );
}
