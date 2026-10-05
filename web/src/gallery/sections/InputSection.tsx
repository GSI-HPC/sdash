// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Input } from "../../primitives/Input";
import { Example, Section } from "../Section";

/** The width of a field of the gallery, and less where the window is. */
const width = "w-60 max-w-full";

/** Every size, fill and state of a text field. */
export function InputSection() {
  const [name, setName] = useState("");

  return (
    <Section id="input">
      <Example title="With a description, a placeholder and a value">
        <Input
          label="Example name"
          description="Shown in the list of examples."
          className={width}
        />
        <Input
          label="Example title"
          placeholder="Type a title"
          className={width}
        />
        <Input
          label="Example owner"
          defaultValue="First example"
          className={width}
        />
      </Example>
      <Example title="Invalid, for as long as it is empty">
        <Input
          label="Required name"
          value={name}
          onValueChange={(next) => {
            setName(next);
          }}
          description="Type anything to make it valid."
          {...(name.trim() === "" ? { error: "Enter a name." } : {})}
          className={width}
        />
      </Example>
      <Example title="Checked by the browser, which says what is wrong once Enter is pressed">
        <Input
          label="Example address"
          type="email"
          defaultValue="not an address"
          className={width}
        />
      </Example>
      <Example title="Read-only and disabled">
        <Input
          label="Example id"
          readOnly
          mono
          defaultValue="example-42"
          className={width}
        />
        <Input
          label="Example state"
          disabled
          defaultValue="Not available"
          className={width}
        />
      </Example>
      <Example title="With an icon, and a label for assistive technology alone">
        <Input
          label="Search examples"
          labelHidden
          leading="search"
          placeholder="Search examples"
          className={width}
        />
        <Input
          label="Search small examples"
          labelHidden
          leading="search"
          size="sm"
          placeholder="Search small examples"
          className={width}
        />
      </Example>
      <Example title="Small, and in the monospaced font">
        <Input
          label="Small field"
          size="sm"
          defaultValue="First example"
          className={width}
        />
        <Input
          label="Example path"
          mono
          defaultValue="/example"
          className={width}
        />
      </Example>
      <Example title="On the page, with the fill of a surface" on="page">
        <Input
          label="Field on the page"
          fill="surface"
          placeholder="Type a name"
          description="A field outside a card."
          className={width}
        />
        <Input
          label="Invalid field on the page"
          fill="surface"
          defaultValue="First example"
          error="This name is taken."
          className={width}
        />
      </Example>
    </Section>
  );
}
