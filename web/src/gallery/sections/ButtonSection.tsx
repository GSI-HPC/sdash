// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Button } from "../../primitives/Button";
import { Tooltip } from "../../primitives/Tooltip";
import { Example, Section } from "../Section";

/** The reason the buttons that are disabled with a reason give. */
const reason = "Nothing has changed, so there is nothing to save.";

/** Every look, tone, size and state of a button. */
export function ButtonSection() {
  return (
    <Section id="button">
      <Example title="Looks">
        <Button variant="primary">Save changes</Button>
        <Button>Cancel</Button>
        <Button variant="ghost">Show details</Button>
      </Example>
      <Example title="Looks of a destructive action">
        <Button variant="primary" tone="danger">
          Delete example
        </Button>
        <Button tone="danger">Remove example</Button>
        <Button variant="ghost" tone="danger">
          Discard changes
        </Button>
      </Example>
      <Example title="On the page" on="page">
        <Button variant="primary">Save example</Button>
        <Button>Close example</Button>
        <Button variant="ghost">Show example</Button>
        <Button tone="danger">Clear example</Button>
        <Button variant="ghost" tone="danger">
          Discard example
        </Button>
      </Example>
      <Example title="Sizes">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Example>
      <Example title="Sizes of the filled look">
        <Button variant="primary" size="xs">
          Filled, extra small
        </Button>
        <Button variant="primary" size="sm">
          Filled, small
        </Button>
        <Button variant="primary" size="md">
          Filled, medium
        </Button>
        <Button variant="primary" size="lg">
          Filled, large
        </Button>
      </Example>
      <Example title="Sizes of a destructive action">
        <Button tone="danger" size="xs">
          Destructive, extra small
        </Button>
        <Button tone="danger" size="sm">
          Destructive, small
        </Button>
        <Button tone="danger" size="md">
          Destructive, medium
        </Button>
        <Button tone="danger" size="lg">
          Destructive, large
        </Button>
      </Example>
      <Example title="Sizes of the look with text alone">
        <Button variant="ghost" size="xs">
          Text, extra small
        </Button>
        <Button variant="ghost" size="sm">
          Text, small
        </Button>
        <Button variant="ghost" size="md">
          Text, medium
        </Button>
        <Button variant="ghost" size="lg">
          Text, large
        </Button>
      </Example>
      <Example title="With an icon">
        <Button variant="primary" icon="submit">
          New example
        </Button>
        <Button icon="search">Find example</Button>
        <Button iconEnd="chevronDown">More options</Button>
      </Example>
      <Example title="Disabled">
        <Button variant="primary" disabled>
          Save draft
        </Button>
        <Button disabled>Cancel draft</Button>
        <Button variant="ghost" disabled>
          Show draft
        </Button>
        <Button variant="primary" tone="danger" disabled>
          Delete draft
        </Button>
        <Button tone="danger" disabled>
          Remove draft
        </Button>
      </Example>
      <Example title="Disabled with a reason, which keeps its place in the order of the Tab key">
        <Tooltip kind="description" label={reason}>
          <Button variant="primary" disabled focusableWhenDisabled>
            Save nothing
          </Button>
        </Tooltip>
        <Tooltip kind="description" label={reason}>
          <Button disabled focusableWhenDisabled>
            Send nothing
          </Button>
        </Tooltip>
      </Example>
    </Section>
  );
}
