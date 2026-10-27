// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "../../primitives/Menu";
import { Tooltip } from "../../primitives/Tooltip";
import { Example, Section } from "../Section";

type Order = "first" | "second";

/**
 * A menu with every kind of entry, and one opened from an icon. The line
 * below the buttons says which entry was chosen last.
 */
export function MenuSection() {
  const [order, setOrder] = useState<Order>("first");
  const [chosen, setChosen] = useState("nothing yet");
  /** What an entry needs to write its name into the line below. */
  function choose(name: string) {
    return {
      onClick: () => {
        setChosen(name);
      },
    };
  }

  return (
    <Section id="menu">
      <Example title="Actions in a group, one of them disabled with its reason, a choice, and a destructive action">
        <Menu trigger={<Button iconEnd="chevronDown">Actions</Button>}>
          <MenuGroup label="Example actions">
            <MenuItem {...choose("First action")}>First action</MenuItem>
            <Tooltip
              kind="description"
              label="There is nothing for the second action to act on yet."
              side="right"
            >
              <MenuItem disabled {...choose("Second action")}>
                Second action
              </MenuItem>
            </Tooltip>
            <MenuItem detail="example-42" {...choose("Third action")}>
              Third action
            </MenuItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuRadioGroup
            label="Example order"
            value={order}
            onValueChange={setOrder}
          >
            <MenuRadioItem value="first" detail="the default">
              First order
            </MenuRadioItem>
            <MenuRadioItem value="second">Second order</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem tone="danger" {...choose("Delete example")}>
            Delete example
          </MenuItem>
        </Menu>
        <Menu
          trigger={<IconButton icon="jobs" label="More actions" />}
          align="end"
        >
          <MenuItem {...choose("Fourth action")}>Fourth action</MenuItem>
          <MenuItem {...choose("Fifth action")}>Fifth action</MenuItem>
        </Menu>
        <p className="w-full text-t2">
          Chosen last: {chosen}. The order is the {order} one.
        </p>
      </Example>
    </Section>
  );
}
