// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Tab, TabList, TabPanel, Tabs } from "../../primitives/Tabs";
import { Example, Section } from "../Section";

type Part = "first" | "second" | "third" | "fourth";

/** A set of tabs with its panels, and what it says in each. */
function Parts({ label }: { label: string }) {
  const [part, setPart] = useState<Part>("first");

  return (
    <Tabs value={part} onValueChange={setPart} className="w-full min-w-0">
      <TabList label={label}>
        <Tab value="first">First tab</Tab>
        <Tab value="second">Second tab</Tab>
        <Tab value="third" disabled>
          Third tab
        </Tab>
        <Tab value="fourth">Fourth tab</Tab>
      </TabList>
      <TabPanel value="first" className="pt-3">
        <p className="text-t2">The panel of the first tab.</p>
      </TabPanel>
      <TabPanel value="second" className="pt-3">
        <p className="text-t2">The panel of the second tab.</p>
      </TabPanel>
      <TabPanel value="third" className="pt-3">
        <p className="text-t2">
          The panel of the third tab, which cannot be gone to.
        </p>
      </TabPanel>
      <TabPanel value="fourth" className="pt-3">
        <p className="text-t2">The panel of the fourth tab.</p>
      </TabPanel>
    </Tabs>
  );
}

/** Tabs on a card and on the page, one of them disabled. */
export function TabsSection() {
  return (
    <Section id="tabs">
      <Example title="With a tab that is disabled">
        <Parts label="Example parts" />
      </Example>
      <Example title="On the page" on="page">
        <Parts label="Example parts on the page" />
      </Example>
    </Section>
  );
}
