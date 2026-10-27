// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Kbd } from "../../primitives/Kbd";
import { Keys } from "../../shortcuts/Keys";
import { Example, Section } from "../Section";

/** The sizes of a key cap, and a shortcut of the registry drawn with it. */
export function KbdSection() {
  return (
    <Section id="kbd">
      <Example title="Sizes">
        <Kbd>Enter</Kbd>
        <Kbd>Esc</Kbd>
        <Kbd size="sm">Tab</Kbd>
        <Kbd size="sm">F6</Kbd>
      </Example>
      <Example title="In a sentence, where a cap takes the colour of the text">
        <p className="text-t2">
          Press <Kbd>Enter</Kbd> to choose and <Kbd>Esc</Kbd> to leave.
        </p>
      </Example>
      <Example title="A shortcut of the registry, with the modifier of this machine">
        <Keys keys="mod+k" always />
        <Keys keys="g o" always />
        <Keys keys="?" size="small" always />
      </Example>
    </Section>
  );
}
