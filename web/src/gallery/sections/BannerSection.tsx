// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Banner } from "../../primitives/Banner";
import { Button } from "../../primitives/Button";
import { Example, Section } from "../Section";

/** A banner of each tone, one with actions, and one that can be dismissed. */
export function BannerSection() {
  const [dismissed, setDismissed] = useState(false);

  return (
    <Section id="banner">
      <Example title="One of each tone" on="page">
        <div className="flex w-full flex-col gap-2.5">
          <Banner tone="info" title="Example note">
            Something worth knowing about the whole page.
          </Banner>
          <Banner tone="warn" title="Example warning" code="example-warning-17">
            Something is worth a look before going on.
          </Banner>
          <Banner
            tone="err"
            title="Example failure"
            code="Example error: no answer"
            actions={
              <Button size="xs" variant="secondary">
                Retry now
              </Button>
            }
          >
            Something failed, and what shows may be out of date.
          </Banner>
          <Banner tone="ok" title="Example success" />
        </div>
      </Example>
      <Example title="One that can be dismissed" on="page">
        <div className="flex w-full flex-col items-start gap-2.5">
          {!dismissed && (
            <Banner
              tone="info"
              title="Example that can be dismissed"
              className="w-full"
              onDismiss={() => {
                setDismissed(true);
              }}
            >
              Dismissing it moves the focus on, to the button below.
            </Banner>
          )}
          <Button
            onClick={() => {
              setDismissed(false);
            }}
          >
            Show the banner again
          </Button>
        </div>
      </Example>
    </Section>
  );
}
