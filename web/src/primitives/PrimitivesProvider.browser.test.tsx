// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { ScrollArea } from "@base-ui/react/scroll-area";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { Button } from "./Button";
import { PrimitivesProvider } from "./PrimitivesProvider";
import { useToast } from "./Toast";

/** The style elements Base UI has added to the page for its scrollbars. */
function scrollbarStyles(): number {
  return document.querySelectorAll(
    'style[data-href~="base-ui-disable-scrollbar"]',
  ).length;
}

// The server's Content-Security-Policy allows no style element, and the
// browser reports one as a refusal. The select tells Base UI itself to
// leave its element out. The provider says the same for the whole
// application, so that a part somebody uses later, without having read it
// for a style element, brings none either. Base UI's scroll area is such a
// part: no primitive uses it, and it stands in here for the next one.
test("keeps a part of Base UI that would add a style element from adding it", async () => {
  const within = await render(
    <PrimitivesProvider>
      <ScrollArea.Root data-testid="inside" />
    </PrimitivesProvider>,
  );
  await expect.element(within.getByTestId("inside")).toBeInTheDocument();
  expect(scrollbarStyles()).toBe(0);

  // The premise: without the provider the same part adds one.
  const without = await render(<ScrollArea.Root data-testid="outside" />);
  await expect.element(without.getByTestId("outside")).toBeInTheDocument();
  expect(scrollbarStyles()).toBe(1);
});

/** A button that shows a toast, as any component inside the provider can. */
function Saves() {
  const toast = useToast();
  return (
    <Button
      onClick={() => {
        toast.show({ title: "Changes saved", detail: "POST /example 200" });
      }}
    >
      Save changes
    </Button>
  );
}

// The provider holds the toasts and renders the region they appear in, so
// that the application does neither by itself.
test("shows the toast of a component inside it, in the region of the toasts", async () => {
  const screen = await render(
    <PrimitivesProvider>
      <Saves />
    </PrimitivesProvider>,
  );
  const region = screen.getByRole("region", { name: "Notifications" });
  await expect.element(region).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Save changes" });
  button.element().focus();

  await userEvent.keyboard("{Enter}");

  await expect
    .element(region.getByRole("dialog", { name: "Changes saved" }))
    .toBeVisible();
  await expect.element(button).toHaveFocus();
});
