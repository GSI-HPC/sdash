// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Button } from "../../primitives/Button";
import { ConfirmDialog } from "../../primitives/ConfirmDialog";
import { Input } from "../../primitives/Input";
import { Example, Section } from "../Section";

/** A body long enough to scroll inside the box of the request. */
const longBody = JSON.stringify(
  {
    example: true,
    items: Array.from(
      { length: 14 },
      (_, position) => `item ${String(position + 1)}`,
    ),
  },
  null,
  2,
);

/**
 * The confirmations: a destructive one, one whose request has a long
 * body, and one that needs an input before it can be confirmed. Nothing
 * is sent: the line below the buttons says which answer was given.
 */
export function ConfirmDialogSection() {
  const [open, setOpen] = useState<"delete" | "send" | "rename" | null>(null);
  const [answer, setAnswer] = useState("none yet");
  const [name, setName] = useState("");
  /** The two answers of a confirmation, which both close it. */
  const answers = {
    onConfirm: () => {
      setAnswer("confirmed");
      setOpen(null);
    },
    onCancel: () => {
      setAnswer("cancelled");
      setOpen(null);
    },
  };

  return (
    <Section id="confirm-dialog">
      <Example title="Shows the request before it is sent, and starts on Cancel">
        <Button
          tone="danger"
          onClick={() => {
            setOpen("delete");
          }}
        >
          Delete example
        </Button>
        <Button
          onClick={() => {
            setOpen("send");
          }}
        >
          Send example
        </Button>
        <Button
          onClick={() => {
            setName("");
            setOpen("rename");
          }}
        >
          Rename example
        </Button>
        <p className="w-full text-t2">The last answer: {answer}.</p>
      </Example>
      <ConfirmDialog
        open={open === "delete"}
        title="Delete the example?"
        description="The example is removed for good. This cannot be undone."
        request={{ method: "DELETE", path: "/example" }}
        confirmLabel="Delete example"
        danger
        {...answers}
      />
      <ConfirmDialog
        open={open === "send"}
        title="Send the example?"
        description="The request is sent as it is shown below."
        request={{ method: "POST", path: "/example", body: longBody }}
        confirmLabel="Send example"
        {...answers}
      />
      <ConfirmDialog
        open={open === "rename"}
        title="Rename the example?"
        description="The example gets the name typed below."
        request={{
          method: "PATCH",
          path: "/example",
          body: JSON.stringify({ name }, null, 2),
        }}
        confirmLabel="Rename example"
        confirmDisabled={name.trim() === ""}
        {...answers}
      >
        <Input
          label="New name"
          value={name}
          onValueChange={(next) => {
            setName(next);
          }}
        />
      </ConfirmDialog>
    </Section>
  );
}
