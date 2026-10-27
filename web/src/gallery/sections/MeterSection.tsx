// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Meter } from "../../primitives/Meter";
import { Example, Section } from "../Section";

const marks = { warn: 75, err: 90 } as const;

function ofSixtyFour(value: number): string {
  return `${String(value)} of 64`;
}

/** Every size and layout, the marks in both directions, and values out of range. */
export function MeterSection() {
  return (
    <Section id="meter">
      <Example title="Three sizes, the label and value above">
        <div className="flex w-full max-w-80 flex-col gap-3">
          <Meter label="Small" value={25} size="sm" />
          <Meter label="Medium" value={50} />
          <Meter label="Large" value={75} size="lg" />
        </div>
      </Example>
      <Example title="On one line, with marks at 75 and 90">
        <div className="flex w-full max-w-80 flex-col gap-2">
          <Meter label="Below" value={40} thresholds={marks} layout="inline" />
          <Meter
            label="Warning"
            value={80}
            thresholds={marks}
            layout="inline"
          />
          <Meter label="Error" value={96} thresholds={marks} layout="inline" />
        </div>
      </Example>
      <Example title="What is left, bad when it is low">
        <div className="flex w-full max-w-80 flex-col gap-3">
          <Meter
            label="Left, plenty"
            value={60}
            thresholds={{ warn: 25, err: 10, direction: "low" }}
          />
          <Meter
            label="Left, little"
            value={8}
            thresholds={{ warn: 25, err: 10, direction: "low" }}
          />
        </div>
      </Example>
      <Example title="Its own range and words, and values outside the range">
        <div className="flex w-full max-w-80 flex-col gap-3">
          <Meter label="Of 64" value={12.5} max={64} format={ofSixtyFour} />
          <Meter label="Above the range" value={120} />
          <Meter label="Below the range" value={-5} />
          <Meter label="No value" value={Number.NaN} />
        </div>
      </Example>
    </Section>
  );
}
