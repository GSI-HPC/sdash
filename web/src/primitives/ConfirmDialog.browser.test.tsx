// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { settled } from "../testing/app";
import { Button } from "./Button";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1280, 720);
});

/**
 * A page with a button that opens a confirmation. `answers` is told what
 * the user answered, and the confirmation closes on either answer.
 * `withoutText` leaves out the sentence below the question.
 */
function Page({
  answers = [],
  withoutText = false,
  ...props
}: {
  answers?: string[];
  withoutText?: boolean;
} & Partial<ConfirmDialogProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open confirmation
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete the example?"
        {...(withoutText
          ? {}
          : {
              description: "The example is removed and cannot be brought back.",
            })}
        request={{ method: "DELETE", path: "/example" }}
        confirmLabel="Delete example"
        danger
        onConfirm={() => {
          answers.push("confirm");
          setOpen(false);
        }}
        onCancel={() => {
          answers.push("cancel");
          setOpen(false);
        }}
        {...props}
      />
    </>
  );
}

/** Opens the confirmation from the keyboard. */
async function openByKeyboard(screen: Awaited<ReturnType<typeof render>>) {
  const opener = screen.getByRole("button", { name: "Open confirmation" });
  opener.element().focus();
  await userEvent.keyboard("{Enter}");
  const dialog = screen.getByRole("alertdialog");
  await expect.element(dialog).toBeVisible();
  return { opener, dialog };
}

/** The colour a class gives a text, as the browser reports it. */
function colourOf(className: string): string {
  const probe = document.createElement("span");
  probe.className = className;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

test("is an alert dialog named by its question", async () => {
  const screen = await render(<Page />);

  const { dialog } = await openByKeyboard(screen);

  await expect.element(dialog).toHaveAccessibleName("Delete the example?");
  expect(screen.getByRole("dialog").elements()).toEqual([]);
});

// The request is what the question is about. A screen reader says what
// describes a dialog when it opens, so the method and the path are part of
// that, after the text; the body, which can be long, is read in the
// dialog.
test("is described by its text and by the method and the path of the request", async () => {
  const first = await render(
    <Page
      request={{ method: "PUT", path: "/example", body: '{"example": true}' }}
    />,
  );
  const { dialog } = await openByKeyboard(first);
  await expect
    .element(dialog)
    .toHaveAccessibleDescription(
      "The example is removed and cannot be brought back. PUT /example",
    );
  await first.unmount();

  // Without a text the request alone describes it.
  const second = await render(<Page withoutText />);
  const bare = await openByKeyboard(second);
  await expect
    .element(bare.dialog)
    .toHaveAccessibleDescription("DELETE /example");
});

// What is confirmed is what is sent. The user reads the request itself,
// and a screen reader finds it as a group with a name.
test("shows the method, the path and the body of the request as text", async () => {
  const body = '{\n  "example": true\n}';
  const screen = await render(
    <Page
      title="Create the example?"
      confirmLabel="Create example"
      danger={false}
      request={{ method: "POST", path: "/example?dry-run=false", body }}
    />,
  );
  const { dialog } = await openByKeyboard(screen);

  const request = dialog.getByRole("group", { name: "Request" });
  await expect.element(request).toBeVisible();
  await expect
    .element(request.getByText("POST", { exact: true }))
    .toBeVisible();
  await expect
    .element(request.getByText("/example?dry-run=false", { exact: true }))
    .toBeVisible();
  // The body as it was given, line breaks included.
  const shown = request.element().querySelector("pre");
  expect(shown?.textContent).toBe(body);
  expect(shown ? getComputedStyle(shown).whiteSpace : "").toContain("pre");
});

test("leaves the body out of a request that has none", async () => {
  const screen = await render(<Page />);
  const { dialog } = await openByKeyboard(screen);

  const request = dialog.getByRole("group", { name: "Request" });
  await expect
    .element(request.getByText("DELETE", { exact: true }))
    .toBeVisible();
  expect(request.element().querySelector("pre")).toBeNull();
});

// The word says what the request does, and its colour repeats it.
test.each([
  ["GET", "text-info-fg"],
  ["POST", "text-ok-fg"],
  ["PUT", "text-ok-fg"],
  ["PATCH", "text-ok-fg"],
  ["DELETE", "text-err-fg"],
] as const)("sets the method %s in the colour %s", async (method, colour) => {
  const screen = await render(<Page request={{ method, path: "/example" }} />);
  const { dialog } = await openByKeyboard(screen);

  const word = dialog
    .getByRole("group", { name: "Request" })
    .getByText(method, { exact: true });
  expect(getComputedStyle(word.element()).color).toBe(colourOf(colour));
});

// Enter pressed a moment too soon, by a user who expected another page,
// must send nothing. Left to itself a dialog gives the focus to its first
// control, which here is a field the caller added.
test("starts with the focus on Cancel", async () => {
  const screen = await render(
    <Page>
      <input aria-label="Example field" />
    </Page>,
  );

  const { dialog } = await openByKeyboard(screen);

  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
  // The field is before it in the order of the Tab key.
  await userEvent.tab({ shift: true });
  await expect
    .element(dialog.getByRole("textbox", { name: "Example field" }))
    .toHaveFocus();
});

test("confirms by its button and by nothing else", async () => {
  const answers: string[] = [];
  const screen = await render(<Page answers={answers} />);
  const { dialog } = await openByKeyboard(screen);

  // Enter where the focus starts is the other answer.
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(answers).toEqual(["cancel"]);

  await openByKeyboard(screen);
  await userEvent.tab();
  await expect
    .element(dialog.getByRole("button", { name: "Delete example" }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(answers).toEqual(["cancel", "confirm"]);
});

test("cancels on Escape and on Cancel, and gives the focus back", async () => {
  const answers: string[] = [];
  const screen = await render(<Page answers={answers} />);
  const { opener, dialog } = await openByKeyboard(screen);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(answers).toEqual(["cancel"]);
  await expect.element(opener).toHaveFocus();

  await userEvent.keyboard("{Enter}");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => dialog.elements()).toEqual([]);
  expect(answers).toEqual(["cancel", "cancel"]);
  await expect.element(opener).toHaveFocus();
});

// It asks a question. A press beside it is no answer, and a user who
// missed a button by a few pixels must not lose the question.
test("stays open on a press outside", async () => {
  const answers: string[] = [];
  const screen = await render(<Page answers={answers} />);
  const { dialog } = await openByKeyboard(screen);

  await userEvent.click(document.body, { position: { x: 10, y: 10 } });
  await settled();

  await expect.element(dialog).toBeVisible();
  expect(answers).toEqual([]);
});

// The press is no answer, and it must not take the focus out of the
// confirmation either: left on the page, the focus would be on nothing,
// Enter would reach neither button, and the Tab key would start from
// outside.
test("keeps the focus on Cancel when the scrim is pressed, and the Tab key inside", async () => {
  const answers: string[] = [];
  const screen = await render(<Page answers={answers} />);
  const { dialog } = await openByKeyboard(screen);
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Delete example" });

  await userEvent.click(document.body, { position: { x: 10, y: 10 } });
  await settled();

  await expect.element(cancel).toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(confirm).toHaveFocus();
  await userEvent.tab();
  await expect.element(cancel).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(answers).toEqual(["cancel"]);
});

test("keeps the focus inside, on its two buttons", async () => {
  const screen = await render(<Page />);
  const { dialog } = await openByKeyboard(screen);
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Delete example" });
  await expect.element(cancel).toHaveFocus();

  await userEvent.tab();
  await expect.element(confirm).toHaveFocus();
  await userEvent.tab();
  await expect.element(cancel).toHaveFocus();
});

test("cannot be confirmed while the confirming button is disabled", async () => {
  const answers: string[] = [];
  const screen = await render(<Page answers={answers} confirmDisabled />);
  const { dialog } = await openByKeyboard(screen);
  const confirm = dialog.getByRole("button", { name: "Delete example" });

  await expect.element(confirm).toBeDisabled();
  await userEvent.click(confirm.element(), { force: true });
  // The Tab key has nowhere to go but Cancel.
  await userEvent.tab();
  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
  await settled();
  expect(answers).toEqual([]);

  await screen.rerender(<Page answers={answers} />);
  await confirm.click();
  expect(answers).toEqual(["confirm"]);
});

test("shows what the caller adds between the text and the request", async () => {
  const screen = await render(
    <Page>
      <label>
        Type the name of the example
        <input />
      </label>
    </Page>,
  );
  const { dialog } = await openByKeyboard(screen);

  const field = dialog.getByRole("textbox", {
    name: "Type the name of the example",
  });
  const text = dialog.getByText(
    "The example is removed and cannot be brought back.",
  );
  const request = dialog.getByRole("group", { name: "Request" });
  const top = (element: Element) => element.getBoundingClientRect().top;
  expect(top(field.element())).toBeGreaterThan(top(text.element()));
  expect(top(request.element())).toBeGreaterThan(top(field.element()));
  // The focus still starts on Cancel, and the field comes before it.
  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
});

// A long body scrolls inside its box, and a box that scrolls has to take
// the focus to be scrolled from the keyboard (WCAG 2.1, 2.1.1).
test("lets the body of a long request be scrolled by the keyboard", async () => {
  const lines = Array.from(
    { length: 60 },
    (_, line) => `"line-${String(line)}": true,`,
  );
  const screen = await render(
    <Page
      request={{ method: "PUT", path: "/example", body: lines.join("\n") }}
    />,
  );
  const { dialog } = await openByKeyboard(screen);
  const body = dialog.element().querySelector("pre");
  if (!body) {
    throw new Error("the request shows no body");
  }
  await expect.poll(() => body.tabIndex).toBe(0);
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  // A stop of the Tab key says what it is.
  expect(
    dialog.getByRole("group", { name: "Body of the request" }).element(),
  ).toBe(body);

  // Backwards from Cancel, where the focus starts.
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(body);
  expect(getComputedStyle(body).outlineOffset).toBe("-2px");
  await userEvent.keyboard("{End}");

  // To its end: the last line of the request can be read.
  await expect
    .poll(() => body.scrollHeight - body.scrollTop - body.clientHeight)
    .toBeLessThanOrEqual(1);
  expect(body.scrollTop).toBeGreaterThan(0);
});

test("is no stop of the Tab key in a body that has nothing to scroll", async () => {
  const screen = await render(
    <Page
      request={{ method: "POST", path: "/example", body: '{"example": true}' }}
    />,
  );
  const { dialog } = await openByKeyboard(screen);
  await settled();

  const body = dialog.element().querySelector("pre");
  expect(body?.tabIndex).toBe(-1);
  // Nobody stops on it, so it needs no role and no name.
  expect(body?.hasAttribute("role")).toBe(false);
  expect(body?.hasAttribute("aria-label")).toBe(false);
});

// 320 by 256 px is a window of 1280 by 1024 px enlarged to four times its
// size, where WCAG 2.1 measures reflow (success criterion 1.4.10). The
// question and the buttons stay; what is between them scrolls.
test.each([
  [320, 256],
  [640, 360],
])(
  "is on a window %d by %d px in full, with its buttons in reach",
  async (width, height) => {
    await page.viewport(width, height);
    const lines = Array.from(
      { length: 60 },
      (_, line) => `"line-${String(line)}": true,`,
    );
    const screen = await render(
      <Page
        request={{ method: "PUT", path: "/example", body: lines.join("\n") }}
      />,
    );
    const { dialog } = await openByKeyboard(screen);

    const frame = dialog.element().getBoundingClientRect();
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(frame.right).toBeLessThanOrEqual(width);
    expect(frame.top).toBeGreaterThanOrEqual(0);
    expect(frame.bottom).toBeLessThanOrEqual(height);
    for (const name of ["Cancel", "Delete example"]) {
      await expect
        .element(dialog.getByRole("button", { name }))
        .toBeInViewport({ ratio: 1 });
    }
    await expect
      .element(dialog.getByRole("heading", { name: "Delete the example?" }))
      .toBeInViewport({ ratio: 1 });
  },
);

// The destructive answer looks like one, and the other does not.
test("fills the confirming button in the colour of an error when confirming destroys", async () => {
  const fill = (name: string) =>
    getComputedStyle(
      page.getByRole("alertdialog").getByRole("button", { name }).element(),
    ).backgroundColor;
  const first = await render(<Page />);
  await openByKeyboard(first);
  expect(fill("Delete example")).toBe(colourOf("text-err-fg"));
  expect(fill("Cancel")).not.toBe(colourOf("text-err-fg"));
  await first.unmount();

  const second = await render(<Page danger={false} />);
  await openByKeyboard(second);
  expect(fill("Delete example")).not.toBe(colourOf("text-err-fg"));
});
