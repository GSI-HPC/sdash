// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Badge, type BadgeTone } from "../../primitives/Badge";
import { Example, Section } from "../Section";

// The tones, each under a word that says nothing about a cluster: which
// state of what gets which tone is for a view to say.
const tones: readonly { tone: BadgeTone; text: string }[] = [
  { tone: "neutral", text: "Neutral" },
  { tone: "ok", text: "Fine" },
  { tone: "warn", text: "Warning" },
  { tone: "err", text: "Error" },
  { tone: "info", text: "Note" },
  { tone: "vio", text: "Violet" },
  { tone: "org", text: "Orange" },
  { tone: "accent", text: "Accent" },
];

/** Every tone, size and shape of a badge. */
export function BadgeSection() {
  return (
    <Section id="badge">
      <Example title="Tones">
        {tones.map(({ tone, text }) => (
          <Badge key={tone} tone={tone}>
            {text}
          </Badge>
        ))}
      </Example>
      <Example title="Tones with a dot">
        {tones.map(({ tone, text }) => (
          <Badge key={tone} tone={tone} dot>
            {text}
          </Badge>
        ))}
      </Example>
      <Example title="On the page" on="page">
        {tones.map(({ tone, text }) => (
          <Badge key={tone} tone={tone} dot>
            {text}
          </Badge>
        ))}
      </Example>
      <Example title="Small">
        {tones.map(({ tone, text }) => (
          <Badge key={tone} tone={tone} size="sm">
            {text}
          </Badge>
        ))}
      </Example>
      <Example title="A pill, and an id in the monospaced font">
        <Badge pill tone="accent">
          12
        </Badge>
        <Badge pill>3 of 4</Badge>
        <Badge mono>example-42</Badge>
        <Badge mono tone="info" size="sm">
          /example
        </Badge>
      </Example>
    </Section>
  );
}
