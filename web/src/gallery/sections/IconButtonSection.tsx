// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { IconButton } from "../../primitives/IconButton";
import { useShortcuts } from "../../shortcuts/useShortcuts";
import { galleryTitle } from "../page";
import { Example, Section } from "../Section";

/** The key that presses the toggle of the section, which shows it. */
const lockKeys = "l";

/** Every look, size and state of a button that shows an icon alone. */
export function IconButtonSection() {
  const [locked, setLocked] = useState(false);
  const [marked, setMarked] = useState(true);
  function toggleLock() {
    setLocked((was) => !was);
  }
  // A button shows a key only when the key does what the button does, so
  // the gallery has this one shortcut of its own.
  useShortcuts([
    {
      keys: lockKeys,
      description: "Lock or unlock the example",
      group: galleryTitle,
      run: toggleLock,
    },
  ]);

  return (
    <Section id="icon-button">
      <Example title="Looks">
        <IconButton icon="search" label="Search examples" />
        <IconButton variant="ghost" icon="close" label="Remove example" />
      </Example>
      <Example title="On the page" on="page">
        <IconButton icon="search" label="Find on the page" />
        <IconButton variant="ghost" icon="close" label="Clear the page" />
      </Example>
      <Example title="Sizes">
        <IconButton size="xs" icon="check" label="Extra small icon" />
        <IconButton size="sm" icon="check" label="Small icon" />
        <IconButton size="md" icon="check" label="Medium icon" />
        <IconButton size="lg" icon="check" label="Large icon" />
      </Example>
      <Example title="A toggle, with the key that presses it in its tooltip">
        <IconButton
          icon="lock"
          label="Lock example"
          keys={lockKeys}
          pressed={locked}
          onClick={toggleLock}
        />
        <IconButton
          variant="ghost"
          icon="check"
          label="Mark example"
          pressed={marked}
          onClick={() => {
            setMarked((was) => !was);
          }}
        />
      </Example>
      <Example title="Disabled">
        <IconButton icon="search" label="Search drafts" disabled />
        <IconButton
          variant="ghost"
          icon="close"
          label="Remove draft"
          disabled
        />
        <IconButton icon="lock" label="Lock draft" pressed disabled />
      </Example>
      <Example title="Disabled and still in the order of the Tab key, where it shows its name">
        <IconButton
          icon="search"
          label="Search nothing"
          disabled
          focusableWhenDisabled
        />
        <IconButton
          icon="lock"
          label="Lock nothing"
          pressed
          disabled
          focusableWhenDisabled
        />
      </Example>
    </Section>
  );
}
