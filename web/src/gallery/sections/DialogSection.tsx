// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Button } from "../../primitives/Button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
} from "../../primitives/Dialog";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { useToast } from "../../primitives/Toast";
import { Example, Section } from "../Section";
import { type Choice, choices } from "./SelectSection";

/** As many paragraphs as make the body of a dialog scroll. */
const paragraphs = Array.from(
  { length: 14 },
  (_, position) =>
    `Paragraph ${String(position + 1)} of an example text that is longer than the dialog is high, so that its body scrolls between a head and a foot that stay.`,
);

/**
 * A dialog in its standard form, with controls that open something of
 * their own, and one whose body is longer than the window allows.
 */
export function DialogSection() {
  const toast = useToast();
  const [open, setOpen] = useState<"form" | "text" | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  function close() {
    setOpen(null);
  }

  return (
    <Section id="dialog">
      <Example title="In the standard form: a head, a body that scrolls and a foot">
        <Button
          onClick={() => {
            setOpen("form");
          }}
        >
          Open dialog
        </Button>
        <Button
          onClick={() => {
            setOpen("text");
          }}
        >
          Open long dialog
        </Button>
      </Example>
      <Dialog
        open={open === "form"}
        onClose={close}
        placement="middle"
        className="w-140"
      >
        <DialogHeader
          title="Example dialog"
          description="A dialog with a small form. What opens from inside it belongs to it."
        />
        <DialogBody className="flex flex-col gap-3">
          <Input label="Dialog name" defaultValue="First example" />
          <Select
            label="Dialog choice"
            options={choices}
            value={choice}
            onValueChange={setChoice}
            placeholder="Choose an option"
          />
          <div className="flex gap-2">
            <IconButton icon="search" label="Search in the dialog" />
          </div>
        </DialogBody>
        <DialogFooter note="Nothing is sent.">
          <DialogClose render={<Button>Cancel</Button>} />
          <Button
            variant="primary"
            onClick={() => {
              close();
              toast.show({
                title: "Example form saved",
                detail: "Nothing was sent.",
              });
            }}
          >
            Save changes
          </Button>
        </DialogFooter>
      </Dialog>
      <Dialog open={open === "text"} onClose={close} className="w-140">
        <DialogHeader title="Long example dialog" />
        <DialogBody className="flex flex-col gap-2">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="primary">Close</Button>} />
        </DialogFooter>
      </Dialog>
    </Section>
  );
}
