// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Badge } from "../../primitives/Badge";
import { KVList } from "../../primitives/KVList";
import { Example, Section } from "../Section";

/** Values in the monospaced font and in words, a badge, and one that breaks. */
export function KVListSection() {
  return (
    <Section id="kv-list">
      <Example title="Terms and their values">
        <KVList
          className="w-full max-w-100"
          items={[
            { term: "Name", value: "example-17" },
            { term: "Count", value: "1,024" },
            {
              term: "State",
              value: (
                <Badge tone="ok" size="sm" dot>
                  Fine
                </Badge>
              ),
              mono: false,
            },
            { term: "In words", value: "Some made-up words", mono: false },
            {
              term: "Path",
              value:
                "/example/of/a/path/that/is/longer/than/the/room/beside/its/term",
            },
          ]}
        />
      </Example>
    </Section>
  );
}
