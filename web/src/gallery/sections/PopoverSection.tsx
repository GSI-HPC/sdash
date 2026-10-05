// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Button } from "../../primitives/Button";
import { Chip } from "../../primitives/Chip";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Popover, PopoverClose } from "../../primitives/Popover";
import { Select } from "../../primitives/Select";
import { Example, Section } from "../Section";
import { type Choice, choices } from "./SelectSection";

/** A popover with a small form, and one whose title is not shown. */
export function PopoverSection() {
  const [choice, setChoice] = useState<Choice | null>("first");
  const [first, setFirst] = useState(true);
  const [second, setSecond] = useState(false);

  return (
    <Section id="popover">
      <Example title="With a title, a description and a small form, a select among it">
        <Popover
          trigger={<Button iconEnd="chevronDown">Example settings</Button>}
          title="Example settings"
          description="What the example shows."
          className="w-72"
        >
          <div className="flex flex-col gap-3 px-3.5 pb-3.5">
            <Input label="Settings name" defaultValue="First example" />
            <Select
              label="Settings choice"
              options={choices}
              value={choice}
              onValueChange={setChoice}
            />
            <div className="flex justify-end">
              <PopoverClose render={<Button variant="primary">Done</Button>} />
            </div>
          </div>
        </Popover>
      </Example>
      <Example title="Opened from an icon, with a title for assistive technology alone">
        <Popover
          trigger={<IconButton icon="conf" label="Example filters" />}
          title="Example filters"
          titleHidden
        >
          <div className="flex flex-wrap gap-2 p-3">
            <Chip pressed={first} onPressedChange={setFirst}>
              First filter
            </Chip>
            <Chip pressed={second} onPressedChange={setSecond}>
              Second filter
            </Chip>
          </div>
        </Popover>
      </Example>
    </Section>
  );
}
