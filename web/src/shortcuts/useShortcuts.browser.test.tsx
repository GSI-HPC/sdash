// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import {
  type Log,
  logging,
  Registers,
  renderWithShortcuts,
} from "../testing/shortcuts";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { useShortcuts } from "./useShortcuts";

// The tests of all files share one store, and a choice left in it by
// another test would switch the character keys off here.
beforeEach(() => {
  localStorage.clear();
});

describe("a registered shortcut", () => {
  test("runs on its key", async () => {
    const log: Log = [];
    await renderWithShortcuts(
      <Registers shortcuts={[logging(log, "t", "theme")]} />,
    );

    await userEvent.keyboard("t");

    expect(log).toEqual(["theme"]);
  });

  test("runs on the second key of its sequence, and other keys do nothing", async () => {
    const log: Log = [];
    await renderWithShortcuts(
      <Registers
        shortcuts={[
          logging(log, "g j", "jobs"),
          logging(log, "g n", "nodes"),
          logging(log, "j", "plain j"),
        ]}
      />,
    );

    await userEvent.keyboard("gn");
    expect(log).toEqual(["nodes"]);

    // A sequence that goes nowhere swallows its second key; the key after
    // it is a new start.
    await userEvent.keyboard("gxj");
    expect(log).toEqual(["nodes", "plain j"]);
  });

  test("runs with the modifier of the platform", async () => {
    const log: Log = [];
    await renderWithShortcuts(
      <Registers shortcuts={[logging(log, "mod+k", "palette")]} />,
    );

    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("k");

    expect(log).toEqual(["palette"]);
  });

  // A component that goes takes its keys with it: the shortcuts of a view
  // must not act on the view that follows it.
  test("is gone when its component is unmounted", async () => {
    const log: Log = [];
    function Page() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setShown(false);
            }}
          >
            Leave
          </button>
          {shown && (
            <Registers shortcuts={[logging(log, "x", "of the view")]} />
          )}
        </>
      );
    }
    const screen = await renderWithShortcuts(<Page />);

    await userEvent.keyboard("x");
    await screen.getByRole("button", { name: "Leave" }).click();
    // The button has the focus now; a key pressed there is still a key.
    await userEvent.keyboard("x");

    expect(log).toEqual(["of the view"]);
  });

  // A component hands in new functions on every render, which close over
  // its newest state. The one that runs has to be the newest.
  test("runs the function of the latest render", async () => {
    const log: Log = [];
    function Counter() {
      const [count, setCount] = useState(0);
      useShortcuts([
        {
          keys: "x",
          description: "count",
          group: "Test",
          run: () => {
            log.push(`pressed at ${String(count)}`);
            setCount(count + 1);
          },
        },
      ]);
      return <output>{count}</output>;
    }
    const screen = await renderWithShortcuts(<Counter />);

    await userEvent.keyboard("x");
    await expect.element(screen.getByRole("status")).toHaveTextContent("1");
    await userEvent.keyboard("x");
    await expect.element(screen.getByRole("status")).toHaveTextContent("2");

    expect(log).toEqual(["pressed at 0", "pressed at 1"]);
  });

  test("can be taken out for a while with enabled", async () => {
    const log: Log = [];
    const shortcut = logging(log, "x", "x");
    const screen = await renderWithShortcuts(
      <Registers shortcuts={[{ ...shortcut, enabled: false }]} />,
    );

    await userEvent.keyboard("x");
    expect(log).toEqual([]);

    await screen.rerender(
      <ShortcutsProvider platform="Linux">
        <Registers shortcuts={[{ ...shortcut, enabled: true }]} />
      </ShortcutsProvider>,
    );
    await userEvent.keyboard("x");
    expect(log).toEqual(["x"]);
  });

  // A component that acts on a key itself says so with preventDefault, as
  // a list does with the arrow keys. The key is then not a shortcut too.
  test("does not run on a key a component has acted on", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <Registers shortcuts={[logging(log, "x", "shortcut")]}>
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key === "x") {
              event.preventDefault();
              log.push("button");
            }
          }}
        >
          Takes x
        </button>
      </Registers>,
    );

    screen.getByRole("button").element().focus();
    await userEvent.keyboard("x");

    expect(log).toEqual(["button"]);
  });
});

// Two components that claim one key in one scope are a mistake in the
// code: the later one runs and the other never does. The developer is
// told in the console, by the ids the registry gave both (registry.ts).
describe("the same keys registered twice in one scope", () => {
  test("are reported to the developer, and the later shortcut runs", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const log: Log = [];

    await renderWithShortcuts(
      <>
        <Registers shortcuts={[logging(log, "x", "one")]} />
        <Registers shortcuts={[logging(log, "x", "other")]} />
      </>,
    );
    await userEvent.keyboard("x");

    const reports = errors.mock.calls.map((call) => call.join(" "));
    errors.mockRestore();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(
      /"x" is registered twice .* the id \d+ \("one"\) .* the id \d+ \("other"\)/,
    );
    expect(log).toEqual(["other"]);
  });

  // A component registers anew when what the help shows of it changes.
  // The registration before is taken out first, so it meets no twin.
  test("are not reported when one component registers its shortcut anew", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <Registers
        shortcuts={[{ ...logging(log, "x", "x"), description: "Expand" }]}
      />,
    );

    await screen.rerender(
      <ShortcutsProvider platform="Linux">
        <Registers
          shortcuts={[{ ...logging(log, "x", "x"), description: "Collapse" }]}
        />
      </ShortcutsProvider>,
    );
    await userEvent.keyboard("x");

    const reports = errors.mock.calls.map((call) => call.join(" "));
    errors.mockRestore();
    expect(reports).toEqual([]);
    expect(log).toEqual(["x"]);
  });
});

describe("while the focus is where text is typed", () => {
  // Every letter of a job name would otherwise switch the theme or leave
  // the view. The four kinds of element are the ones a user types or
  // chooses a value in.
  test.each([
    { field: "an input", role: "textbox", name: "Input" },
    { field: "a textarea", role: "textbox", name: "Textarea" },
    { field: "a select", role: "combobox", name: "Select" },
    { field: "an editable element", role: "textbox", name: "Editable" },
  ] as const)("character keys in $field are text", async ({ role, name }) => {
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <Registers
        shortcuts={[logging(log, "t", "theme"), logging(log, "g j", "jobs")]}
      >
        <input aria-label="Input" />
        <textarea aria-label="Textarea" />
        <select aria-label="Select">
          <option>one</option>
          <option>two</option>
        </select>
        <div
          role="textbox"
          aria-label="Editable"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
        />
      </Registers>,
    );

    screen.getByRole(role, { name }).element().focus();
    await userEvent.keyboard("tgj");

    expect(log).toEqual([]);
  });

  test("the keys reach the field", async () => {
    const screen = await renderWithShortcuts(
      <Registers shortcuts={[logging([], "t", "theme")]}>
        <input aria-label="Name" />
      </Registers>,
    );
    const field = screen.getByRole("textbox", { name: "Name" });

    field.element().focus();
    await userEvent.keyboard("test");

    await expect.element(field).toHaveValue("test");
  });

  // Backspace, Delete, Enter and the arrow keys type no character, and a
  // field has a use for each of them. A view that binds Delete to an
  // action on the selected row must not run it, and take the key away,
  // while the user corrects a filter.
  test("a key that types no character is the field's as well", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <Registers
        shortcuts={["Backspace", "Delete", "Enter", "ArrowLeft"].map((name) =>
          logging(log, name, name),
        )}
      >
        <input aria-label="Filter" defaultValue="abc" />
      </Registers>,
    );
    const field = screen.getByRole("textbox", { name: "Filter" });

    field.element().focus();
    await userEvent.keyboard("{End}{Backspace}{ArrowLeft}{Delete}{Enter}");

    expect(log).toEqual([]);
    await expect.element(field).toHaveValue("a");

    // Away from the field they are shortcuts again.
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("{Delete}");
    expect(log).toEqual(["Delete"]);
  });

  // Escape does nothing in a field, so it stays a shortcut there: a view
  // closes its drawer by it from wherever the focus is.
  test("Escape still runs its shortcut", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <Registers shortcuts={[logging(log, "Escape", "close")]}>
        <input aria-label="Filter" />
      </Registers>,
    );

    screen.getByRole("textbox").element().focus();
    await userEvent.keyboard("{Escape}");

    expect(log).toEqual(["close"]);
  });

  test("a shortcut with the modifier still runs", async () => {
    const log: Log = [];
    const screen = await renderWithShortcuts(
      <Registers shortcuts={[logging(log, "mod+k", "palette")]}>
        <input aria-label="Name" />
      </Registers>,
    );

    screen.getByRole("textbox").element().focus();
    await userEvent.keyboard("{Control>}k{/Control}");

    expect(log).toEqual(["palette"]);
  });
});

// A component that registers a shortcut where no provider is cannot work,
// and says so at once and not by a key that silently does nothing.
test("registering a shortcut outside a provider is an error", async () => {
  await expect(
    render(<Registers shortcuts={[logging([], "x", "x")]} />),
  ).rejects.toThrow("outside a ShortcutsProvider");
});
