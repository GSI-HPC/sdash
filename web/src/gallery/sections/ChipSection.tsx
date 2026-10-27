// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Chip } from "../../primitives/Chip";
import { Example, Section } from "../Section";

const filters = ["First filter", "Second filter", "Third filter"] as const;

/** Every size and state of a chip. */
export function ChipSection() {
  const [on, setOn] = useState<readonly string[]>([filters[0]]);
  function set(name: string, pressed: boolean) {
    setOn((were) =>
      pressed ? [...were, name] : were.filter((other) => other !== name),
    );
  }
  /** What a chip of the given name needs to be the filter of that name. */
  function filter(name: string) {
    return {
      pressed: on.includes(name),
      onPressedChange: (pressed: boolean) => {
        set(name, pressed);
      },
    };
  }

  return (
    <Section id="chip">
      <Example title="Filters that are on or off, each by itself">
        {filters.map((name) => (
          <Chip key={name} {...filter(name)}>
            {name}
          </Chip>
        ))}
      </Example>
      <Example title="With a count">
        <Chip {...filter("Counted filter")} count={12}>
          Counted filter
        </Chip>
        <Chip {...filter("Empty filter")} count={0}>
          Empty filter
        </Chip>
      </Example>
      <Example title="On the page" on="page">
        <Chip {...filter("Page filter")}>Page filter</Chip>
        <Chip {...filter("Other page filter")} count={3}>
          Other page filter
        </Chip>
      </Example>
      <Example title="Small">
        <Chip size="sm" {...filter("Small filter")}>
          Small filter
        </Chip>
        <Chip size="sm" {...filter("Small counted filter")} count={7}>
          Small counted filter
        </Chip>
      </Example>
      <Example title="Disabled">
        <Chip pressed={false} onPressedChange={() => undefined} disabled>
          Filter that is off
        </Chip>
        <Chip pressed onPressedChange={() => undefined} disabled>
          Filter that is on
        </Chip>
      </Example>
    </Section>
  );
}
