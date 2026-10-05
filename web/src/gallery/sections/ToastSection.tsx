// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Button } from "../../primitives/Button";
import { type ToastOptions, useToast } from "../../primitives/Toast";
import { Example, Section } from "../Section";

// One toast of each tone, each behind a button of its own.
const toasts: readonly { button: string; toast: ToastOptions }[] = [
  {
    button: "Show a success",
    toast: { title: "Changes saved", detail: "POST /example 200" },
  },
  {
    button: "Show a note",
    toast: { tone: "info", title: "Example note" },
  },
  {
    button: "Show a warning",
    toast: {
      tone: "warn",
      title: "Example warning",
      detail: "Something is worth a look.",
    },
  },
  {
    button: "Show a failure",
    toast: {
      tone: "err",
      title: "Changes not saved",
      detail: "POST /example 500",
    },
  },
];

/** A toast of each tone. The failure stays until it is dismissed. */
export function ToastSection() {
  const toast = useToast();

  return (
    <Section id="toast">
      <Example title="One of each tone; the failure stays until it is dismissed">
        {toasts.map(({ button, toast: options }) => (
          <Button
            key={button}
            onClick={() => {
              toast.show(options);
            }}
          >
            {button}
          </Button>
        ))}
      </Example>
    </Section>
  );
}
