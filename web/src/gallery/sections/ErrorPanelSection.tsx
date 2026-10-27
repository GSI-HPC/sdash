// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Card } from "../../primitives/Card";
import { ErrorPanel } from "../../primitives/ErrorPanel";
import { Example, Section } from "../Section";

/** An error panel in a card with everything it can hold, and one with a title alone. */
export function ErrorPanelSection() {
  const [tries, setTries] = useState(0);

  return (
    <Section id="error-panel">
      <Example title="In a card, with the error and a retry" on="page">
        <Card
          title="Example that failed"
          level={3}
          className="w-full max-w-120"
        >
          <ErrorPanel
            title="The example did not load."
            code="Example error: the request took too long"
            onRetry={() => {
              setTries((count) => count + 1);
            }}
          >
            Try again, or come back later.
          </ErrorPanel>
          <p role="status" className="mt-2 text-[0.71875rem] text-t2">
            {tries === 0
              ? "Not tried again yet."
              : `Tried again ${String(tries)} ${tries === 1 ? "time" : "times"}.`}
          </p>
        </Card>
      </Example>
      <Example title="The title alone">
        <ErrorPanel title="Something failed." />
      </Example>
    </Section>
  );
}
