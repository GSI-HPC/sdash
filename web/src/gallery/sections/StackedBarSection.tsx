// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { GraphicTone } from "../../primitives/graphics";
import { StackedBar } from "../../primitives/StackedBar";
import { Example, Section } from "../Section";

/** Every tone a part can have, each with a word that says nothing about a cluster. */
export const toneWords: readonly { tone: GraphicTone; word: string }[] = [
  { tone: "accent", word: "Accent" },
  { tone: "ok", word: "Fine" },
  { tone: "warn", word: "Warning" },
  { tone: "err", word: "Error" },
  { tone: "info", word: "Note" },
  { tone: "vio", word: "Violet" },
  { tone: "org", word: "Orange" },
  { tone: "neutral", word: "Neutral" },
];

/** Parts with a rest, parts that fill the whole, every tone, and nothing. */
export function StackedBarSection() {
  return (
    <Section id="stacked-bar">
      <Example title="Three parts of a whole of 100, and the rest">
        <StackedBar
          label="Example parts"
          className="w-full max-w-120"
          total={100}
          parts={[
            { label: "First part", value: 42, tone: "ok" },
            { label: "Second part", value: 18, tone: "warn" },
            { label: "Third part", value: 6, tone: "err" },
          ]}
        />
      </Example>
      <Example title="Every tone, filling the whole">
        <StackedBar
          label="Every tone"
          className="w-full max-w-120"
          size="md"
          parts={toneWords.map(({ tone, word }, index) => ({
            label: word,
            value: index + 2,
            tone,
          }))}
        />
      </Example>
      <Example title="A part of none, and a bar of nothing">
        <div className="flex w-full max-w-120 flex-col gap-3">
          <StackedBar
            label="With a part of none"
            size="sm"
            parts={[
              { label: "Some", value: 3, tone: "info" },
              { label: "None", value: 0, tone: "vio" },
            ]}
          />
          <StackedBar
            label="Nothing"
            size="sm"
            parts={[{ label: "None at all", value: 0, tone: "neutral" }]}
          />
        </div>
      </Example>
    </Section>
  );
}
