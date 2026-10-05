// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useContext, useState } from "react";
import { beforeEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { Modal, ModalTitle } from "../overlay/Modal";
import { SettingsContext } from "./context";
import { ShortcutScope } from "./ShortcutScope";
import { storageKey } from "./ShortcutsProvider";

beforeEach(() => {
  localStorage.clear();
});

describe("the scopes", () => {
  // The scope follows from where a component is rendered. A view that
  // gives "x" a meaning takes it from the shell for as long as it shows.
  test("a shortcut of the view wins over the shell's for the same key", async () => {
    const log: Log = [];
    await renderWithShortcuts(
      <Registers
        shortcuts={[logging(log, "x", "shell"), logging(log, "y", "shell y")]}
      >
        <ShortcutScope scope="view">
          <Registers shortcuts={[logging(log, "x", "view")]} />
        </ShortcutScope>
      </Registers>,
    );

    await userEvent.keyboard("xy");

    expect(log).toEqual(["view", "shell y"]);
  });

  /**
   * A page with shortcuts of the shell and of a view, and a dialog over
   * it, the application's own, with shortcuts of its own. "c" closes the
   * dialog, as its Escape does.
   *
   * With `slow` the dialog is one that takes its time to leave and has a
   * text field in it, which gets the focus when it opens, as the command
   * palette's does.
   */
  function PageWithDialog({ log, slow }: { log: Log; slow?: boolean }) {
    const [open, setOpen] = useState(true);
    const close = () => {
      setOpen(false);
    };
    return (
      <Registers
        shortcuts={[
          logging(log, "x", "shell"),
          logging(log, "g j", "jobs"),
          logging(log, "mod+k", "palette"),
        ]}
      >
        <ShortcutScope scope="view">
          <Registers
            shortcuts={[
              logging(log, "v", "view"),
              logging(log, "Delete", "view Delete"),
              logging(log, "mod+Enter", "view submit"),
            ]}
          />
        </ShortcutScope>
        {/*
          An exit that takes two seconds, as a dialog with motion has one:
          the dialog library keeps the content mounted until it is over.
        */}
        {slow && (
          <style>
            {".slow-exit { transition: opacity 2s linear; }" +
              ".slow-exit[data-ending-style] { opacity: 0; }"}
          </style>
        )}
        <Modal open={open} onClose={close} className={slow ? "slow-exit" : ""}>
          <ModalTitle>Dialog</ModalTitle>
          {slow && <input aria-label="Field" />}
          <Registers
            shortcuts={[
              logging(log, "y", "dialog"),
              { keys: "c", description: "close", group: "Test", run: close },
            ]}
          />
        </Modal>
      </Registers>
    );
  }

  // What lies behind a dialog cannot be seen. Its keys rest until the
  // dialog is gone, and come back with it: the character keys, and for a
  // view also a key that types none and a shortcut with the modifier,
  // which would cancel a job or submit a form the user is not looking at.
  // The palette's shortcut is the shell's and opens over any dialog.
  test("an open dialog takes the keys from the page below it", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(<PageWithDialog log={log} />);
    await expect.element(screen.getByRole("dialog")).toBeVisible();

    await userEvent.keyboard("xgjvy{Delete}");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(log).toEqual(["dialog", "palette"]);

    await userEvent.keyboard("c");
    await expect.poll(() => screen.getByRole("dialog").elements()).toEqual([]);
    await userEvent.keyboard("xv{Delete}");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(log).toEqual([
      "dialog",
      "palette",
      "shell",
      "view",
      "view Delete",
      "view submit",
    ]);
  });

  // Escape and then "g" "j" is what a user in a hurry types. The keys of
  // the page are back when the dialog is closed, not when the last of it
  // has left the screen: the registry no longer takes a dialog to be open,
  // and the focus is out of the text field that is going, where the keys
  // would be text.
  test("the keys of the page are back as soon as the dialog closes, while it is still leaving", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(<PageWithDialog log={log} slow />);
    const field = screen.getByRole("textbox", { name: "Field" });
    await expect.element(field).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("xgj");

    expect(log).toEqual(["shell", "jobs"]);
    // The premise: the dialog was still on its way out when they ran, and
    // nothing was typed into it.
    const leaving = document.querySelector(".slow-exit");
    expect(leaving).not.toBeNull();
    expect(leaving?.querySelector("input")?.value).toBe("");
    expect(leaving?.contains(document.activeElement)).toBe(false);
  });
});

describe("the switch for character-key shortcuts", () => {
  /** A checkbox on the user's choice, as the help dialog has one. */
  function Switch() {
    const { characterKeys, setCharacterKeys } = useContext(SettingsContext);
    return (
      <label>
        <input
          type="checkbox"
          checked={characterKeys}
          onChange={(event) => {
            setCharacterKeys(event.target.checked);
          }}
        />
        Single-key shortcuts
      </label>
    );
  }

  function Page({ log }: { log: Log }) {
    return (
      <Registers
        shortcuts={[
          logging(log, "t", "theme"),
          logging(log, "g j", "jobs"),
          logging(log, "mod+k", "palette"),
        ]}
      >
        <Switch />
      </Registers>
    );
  }

  // WCAG 2.1, success criterion 2.1.4: a user of speech input, whose
  // words arrive as keys, has to be able to switch these off. The
  // shortcut with a modifier stays, and is the way to everything else.
  test("switches off the character keys and leaves the others", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(<Page log={log} />);

    await screen.getByRole("checkbox").click();
    // Away from the checkbox, where a character key would be left alone
    // for another reason.
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("tgj");
    await userEvent.keyboard("{Control>}k{/Control}");

    expect(log).toEqual(["palette"]);

    await screen.getByRole("checkbox").click();
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("t");
    expect(log).toEqual(["palette", "theme"]);
  });

  test("keeps the choice for the next visit", async () => {
    const log: Log = [];
    const first = await renderWithShortcuts(<Page log={log} />);
    await first.getByRole("checkbox").click();
    expect(localStorage.getItem(storageKey)).toBe("off");
    await first.unmount();

    const second = await renderWithShortcuts(<Page log={log} />);

    await expect.element(second.getByRole("checkbox")).not.toBeChecked();
    await userEvent.keyboard("t");
    expect(log).toEqual([]);
  });

  // The store is shared with whatever else runs on the origin. Only the
  // word for "off" switches the shortcuts off.
  test("is on unless the stored choice says off", async () => {
    localStorage.setItem(storageKey, "false");
    const log: Log = [];

    const screen = await renderWithShortcuts(<Page log={log} />);

    await expect.element(screen.getByRole("checkbox")).toBeChecked();
    await userEvent.keyboard("t");
    expect(log).toEqual(["theme"]);
  });
});
