// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { Keys } from "../shortcuts/Keys";
import { colourOf } from "../testing/colours";
import { Kbd } from "./Kbd";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

// The element that HTML has for a key: a screen reader that announces
// semantics says "keyboard input", and a user's stylesheet finds it.
test("is a kbd element with the text of the key", async () => {
  const screen = await render(<Kbd>Esc</Kbd>);
  const cap = screen.getByText("Esc").element();

  expect(cap.tagName).toBe("KBD");
  expect(cap.textContent).toBe("Esc");
  expect(getComputedStyle(cap).fontFamily).toContain("DM Mono");
});

// The handoff's --t3 for every cap is below 4.5:1 on the backgrounds caps
// stand on in the light theme. A cap names no colour, so that it has the
// contrast of the text it is part of, in whichever theme.
test.for(["light", "dark"] as const)(
  "takes the colour of the text around it in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <p className="text-t2">
        Press <Kbd>Enter</Kbd> to choose.
      </p>,
    );

    expect(getComputedStyle(screen.getByText("Enter").element()).color).toBe(
      colourOf("--t2"),
    );
  },
);

test("is smaller when it is asked to be", async () => {
  const screen = await render(
    <>
      <Kbd>M</Kbd>
      <Kbd size="sm">S</Kbd>
    </>,
  );
  const size = (text: string) =>
    parseFloat(
      getComputedStyle(screen.getByText(text, { exact: true }).element())
        .fontSize,
    );

  expect(size("S")).toBeLessThan(size("M"));
});

// The component of the shell that draws a shortcut of the registry keeps
// what it did before the primitive was there: one cap for each step of a
// sequence, in the two sizes its callers name.
test("is what a shortcut of the registry is drawn with", async () => {
  const screen = await render(
    <>
      <Keys keys="g o" />
      <Keys keys="t" size="small" />
    </>,
  );
  const caps = [...screen.container.querySelectorAll("kbd")];

  expect(caps.map((cap) => cap.textContent)).toEqual(["g", "o", "t"]);
  const [medium, , small] = caps;
  expect(medium && small).toBeTruthy();
  expect(parseFloat(getComputedStyle(small ?? root).fontSize)).toBeLessThan(
    parseFloat(getComputedStyle(medium ?? root).fontSize),
  );
  expect(getComputedStyle(medium ?? root).borderTopWidth).toBe("1px");
});
