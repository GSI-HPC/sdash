// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { Example, Section } from "../Section";

/** The two kinds of tooltip, on every side of a control. */
export function TooltipSection() {
  return (
    <Section id="tooltip">
      <Example title="A label, which repeats the name of a control that shows an icon alone, on each side">
        <IconButton icon="search" label="Shown above" tooltipSide="top" />
        <IconButton
          icon="search"
          label="Shown to the right"
          tooltipSide="right"
        />
        <IconButton icon="search" label="Shown below" tooltipSide="bottom" />
        <IconButton
          icon="search"
          label="Shown to the left"
          tooltipSide="left"
        />
      </Example>
      <Example title="A description, which says what the name does not">
        <Tooltip
          kind="description"
          label="Nothing is sent: this is an example."
        >
          <Button>Send example</Button>
        </Tooltip>
        <Tooltip
          kind="description"
          label="There is nothing to delete yet, so this button does nothing."
          align="start"
        >
          <Button tone="danger" disabled focusableWhenDisabled>
            Delete nothing
          </Button>
        </Tooltip>
      </Example>
    </Section>
  );
}
