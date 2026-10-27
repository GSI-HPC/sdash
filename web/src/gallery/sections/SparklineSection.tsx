// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Sparkline } from "../../primitives/Sparkline";
import { Example, Section } from "../Section";
import { series } from "./StatCardSection";
import { toneWords } from "./StackedBarSection";

/** Series that rise, fall and stay, short ones, and every tone. */
export function SparklineSection() {
  return (
    <Section id="sparkline">
      <Example title="Rising, falling, the same throughout">
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          <Sparkline label="Rising" values={series} />
          <Sparkline label="Falling" values={[...series].reverse()} />
          <Sparkline label="The same" values={[7, 7, 7, 7, 7]} />
        </div>
      </Example>
      <Example title="One value, and none">
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          <Sparkline label="One value" values={[5]} />
          <Sparkline label="No values" values={[]} />
        </div>
      </Example>
      <Example title="Every tone">
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4">
          {toneWords.map(({ tone, word }, index) => (
            <Sparkline
              key={tone}
              label={word}
              tone={tone}
              values={series.map(
                (value, step) => value + ((step * (index + 3)) % 9),
              )}
            />
          ))}
        </div>
      </Example>
    </Section>
  );
}
