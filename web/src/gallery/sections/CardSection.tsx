// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";

import { Card } from "../../primitives/Card";
import { KVList } from "../../primitives/KVList";
import { Example, Section } from "../Section";

/** A card with everything it can hold, one without a title, one flush. */
export function CardSection() {
  return (
    <Section id="card">
      <Example title="A title, an action and a footer" on="page">
        <Card
          title="Example card"
          level={3}
          action={
            <Link to={{ hash: "#card" }}>
              More examples <span aria-hidden="true">→</span>
            </Link>
          }
          footer="A footer line below the content."
          className="w-full max-w-120"
        >
          <p className="text-t2">
            The content of the card, here a paragraph of made-up text that is
            long enough to break into a second line where the card is narrow.
          </p>
        </Card>
      </Example>
      <Example title="Without a title, and flush to the edges" on="page">
        <Card className="w-full max-w-72">
          <p className="text-t2">A card that is a surface and nothing more.</p>
        </Card>
        <Card title="Flush content" level={3} flush className="w-full max-w-72">
          <KVList
            className="px-4 py-1"
            items={[
              { term: "First term", value: "example-17" },
              { term: "Second term", value: "1,024" },
            ]}
          />
        </Card>
      </Example>
    </Section>
  );
}
