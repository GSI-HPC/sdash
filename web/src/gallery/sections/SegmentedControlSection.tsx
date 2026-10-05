// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { SegmentedControl } from "../../primitives/SegmentedControl";
import { Example, Section } from "../Section";

type Range = "first" | "second" | "third";

const ranges: readonly { value: Range; label: string }[] = [
  { value: "first", label: "First range" },
  { value: "second", label: "Second range" },
  { value: "third", label: "Third range" },
];

/** The sizes of a segmented control, on a card and on the page. */
export function SegmentedControlSection() {
  const [range, setRange] = useState<Range>("first");
  const [small, setSmall] = useState<Range>("second");
  const [onPage, setOnPage] = useState<Range>("third");

  return (
    <Section id="segmented-control">
      <Example title="One of several, always">
        <SegmentedControl
          label="Example range"
          options={ranges}
          value={range}
          onValueChange={setRange}
        />
      </Example>
      <Example title="Small">
        <SegmentedControl
          label="Small example range"
          options={ranges}
          value={small}
          onValueChange={setSmall}
          size="sm"
        />
      </Example>
      <Example title="On the page" on="page">
        <SegmentedControl
          label="Example range on the page"
          options={ranges}
          value={onPage}
          onValueChange={setOnPage}
        />
      </Example>
    </Section>
  );
}
