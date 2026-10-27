// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Legend } from "../../primitives/Legend";
import { Example, Section } from "../Section";
import { toneWords } from "./StackedBarSection";

/** A legend with values, one without, and one with the swatch of the rest. */
export function LegendSection() {
  return (
    <Section id="legend">
      <Example title="With values">
        <Legend
          className="max-w-120"
          items={[
            { label: "First part", tone: "ok", value: "42" },
            { label: "Second part", tone: "warn", value: "18" },
            { label: "Third part", tone: "err", value: "6" },
          ]}
        />
      </Example>
      <Example title="Every tone, without values">
        <Legend
          className="max-w-120"
          items={toneWords.map(({ tone, word }) => ({ label: word, tone }))}
        />
      </Example>
      <Example title="With the rest of a whole">
        <Legend
          className="max-w-120"
          items={[
            { label: "Taken", tone: "accent", value: "3.5 TB" },
            { label: "Free", tone: "rest", value: "1.5 TB" },
          ]}
        />
      </Example>
    </Section>
  );
}
