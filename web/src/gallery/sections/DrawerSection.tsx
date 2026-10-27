// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Badge } from "../../primitives/Badge";
import { Button } from "../../primitives/Button";
import { ConfirmDialog } from "../../primitives/ConfirmDialog";
import { Drawer, DrawerBody, DrawerHeader } from "../../primitives/Drawer";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { Tab, TabList, TabPanel, Tabs } from "../../primitives/Tabs";
import { Example, Section } from "../Section";
import { type Choice, choices } from "./SelectSection";

type Part = "summary" | "settings";

/** As many paragraphs as make the body of the drawer scroll. */
const paragraphs = Array.from(
  { length: 18 },
  (_, position) =>
    `Paragraph ${String(position + 1)} of an example text that is longer than the drawer is high, so that its body scrolls below a header that stays.`,
);

/**
 * A drawer with everything its header can hold, tabs among it, and a
 * confirmation that opens from inside it and goes with it.
 *
 * Whether it is open is kept here and not in the address, where a view
 * keeps it (doc/ui.md, "State in the address"): the gallery shows the
 * primitive, which knows nothing of addresses.
 */
export function DrawerSection() {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<Part>("summary");
  const [asking, setAsking] = useState(false);
  const [choice, setChoice] = useState<Choice | null>("first");

  return (
    <Section id="drawer">
      <Example title="With a line above its title, a line below it, actions and tabs">
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Open drawer
        </Button>
      </Example>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Tabs value={part} onValueChange={setPart} className="contents">
          <DrawerHeader
            eyebrow="Example"
            title="Example details"
            meta={
              <>
                <Badge tone="ok" dot>
                  Fine
                </Badge>
                <span>Changed a moment ago</span>
              </>
            }
            actions={
              <>
                <Button>Edit example</Button>
                <Button
                  tone="danger"
                  onClick={() => {
                    setAsking(true);
                  }}
                >
                  Delete example
                </Button>
              </>
            }
          >
            <TabList label="Example details">
              <Tab value="summary">Summary</Tab>
              <Tab value="settings">Settings</Tab>
            </TabList>
          </DrawerHeader>
          <DrawerBody>
            <TabPanel value="summary" className="flex flex-col gap-2">
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </TabPanel>
            <TabPanel value="settings" className="flex flex-col gap-3">
              <Input label="Drawer name" defaultValue="First example" />
              <Select
                label="Drawer choice"
                options={choices}
                value={choice}
                onValueChange={setChoice}
              />
            </TabPanel>
          </DrawerBody>
        </Tabs>
        {/*
          Inside the drawer, so that the confirmation goes when the drawer
          does.
        */}
        <ConfirmDialog
          open={asking}
          title="Delete the example?"
          description="The example is removed for good. This cannot be undone."
          request={{ method: "DELETE", path: "/example" }}
          confirmLabel="Delete example"
          danger
          onConfirm={() => {
            setAsking(false);
            setOpen(false);
          }}
          onCancel={() => {
            setAsking(false);
          }}
        />
      </Drawer>
    </Section>
  );
}
