// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Select, type SelectOption } from "../../primitives/Select";
import { Example, Section } from "../Section";

/** The values of the options of every select of the gallery. */
export type Choice = "first" | "second" | "third" | "fourth";

/** The options of every select of the gallery, one of them disabled. */
export const choices: readonly SelectOption<Choice>[] = [
  { value: "first", label: "First option" },
  { value: "second", label: "Second option" },
  { value: "third", label: "Third option", disabled: true },
  { value: "fourth", label: "Fourth option" },
];

/** The width of a field of the gallery, and less where the window is. */
const width = "w-60 max-w-full";

/** Every size, fill and state of a select. */
export function SelectSection() {
  const [none, setNone] = useState<Choice | null>(null);
  const [chosen, setChosen] = useState<Choice | null>("second");
  const [required, setRequired] = useState<Choice | null>(null);
  const [small, setSmall] = useState<Choice | null>("first");
  const [onPage, setOnPage] = useState<Choice | null>(null);

  return (
    <Section id="select">
      <Example title="With a placeholder, and with an option chosen">
        <Select
          label="Example choice"
          options={choices}
          value={none}
          onValueChange={setNone}
          placeholder="Choose an option"
          description="The third option cannot be chosen."
          className={width}
        />
        <Select
          label="Chosen example"
          options={choices}
          value={chosen}
          onValueChange={setChosen}
          className={width}
        />
      </Example>
      <Example title="Invalid, until an option is chosen">
        <Select
          label="Required choice"
          options={choices}
          value={required}
          onValueChange={setRequired}
          placeholder="Choose an option"
          {...(required === null ? { error: "Choose an option." } : {})}
          className={width}
        />
      </Example>
      <Example title="Disabled">
        <Select
          label="Unavailable choice"
          options={choices}
          value="first"
          onValueChange={() => undefined}
          disabled
          className={width}
        />
      </Example>
      <Example title="Small, and with a label for assistive technology alone">
        <Select
          label="Small choice"
          labelHidden
          options={choices}
          value={small}
          onValueChange={setSmall}
          size="sm"
          className={width}
        />
      </Example>
      <Example title="On the page, with the fill of a surface" on="page">
        <Select
          label="Choice on the page"
          options={choices}
          value={onPage}
          onValueChange={setOnPage}
          placeholder="Choose an option"
          fill="surface"
          className={width}
        />
      </Example>
    </Section>
  );
}
