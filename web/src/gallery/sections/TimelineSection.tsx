// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Timeline } from "../../primitives/Timeline";
import { Example, Section } from "../Section";
import { toneWords } from "./StackedBarSection";

// A fixed moment, so that the gallery looks the same on every day.
const now = new Date(2026, 0, 14, 15, 30);

/** A moment `hours` from now. */
function at(hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}

const from = at(-24);

/** Stretches that started before the window, end in it, run on, and touch. */
export function TimelineSection() {
  return (
    <Section id="timeline">
      <Example title="Eight days from yesterday, with the line of now">
        <Timeline
          label="Example stretches over eight days; nothing lists them in words here"
          className="w-full"
          from={from}
          days={8}
          now={now}
          rows={[
            {
              id: "first",
              label: "First",
              detail: "began before the window",
              segments: [
                { label: "First", start: at(-60), end: at(5), tone: "ok" },
              ],
            },
            {
              id: "second",
              label: "Second",
              detail: "two stretches that touch",
              segments: [
                { label: "Early", start: at(20), end: at(44), tone: "warn" },
                { label: "Late", start: at(44), end: at(70), tone: "warn" },
              ],
            },
            {
              id: "third",
              label: "Third",
              detail: "without an end",
              segments: [{ label: "Third", start: at(100), tone: "vio" }],
            },
            {
              id: "fourth",
              label: "Fourth",
              detail: "outside the window",
              segments: [
                { label: "Fourth", start: at(400), end: at(420), tone: "err" },
              ],
            },
          ]}
        />
      </Example>
      <Example title="Every tone">
        <Timeline
          label="Every tone; nothing lists them in words here"
          className="w-full"
          from={from}
          days={8}
          now={now}
          rows={toneWords.map(({ tone, word }, index) => ({
            id: tone,
            label: word,
            segments: [
              {
                label: word,
                start: at(index * 18 - 10),
                end: at(index * 18 + 30),
                tone,
              },
            ],
          }))}
        />
      </Example>
    </Section>
  );
}
