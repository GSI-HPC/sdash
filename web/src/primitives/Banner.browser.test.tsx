// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { colourOf } from "../testing/colours";
import { forceColours } from "../testing/system";
import { Banner, type BannerTone } from "./Banner";

const root = document.documentElement;

beforeEach(() => {
  root.dataset.theme = "light";
});

afterEach(async () => {
  await forceColours(false);
});

// A failure interrupts: it is read at once. A note waits until the reader
// has finished what it was saying.
test("is an alert when it reports a failure, and a status otherwise", async () => {
  const screen = await render(
    <>
      <Banner tone="err" title="Example failure" />
      <Banner tone="warn" title="Example warning" />
      <Banner tone="info" title="Example note" />
      <Banner tone="ok" title="Example success" />
    </>,
  );

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Example failure");
  expect(
    screen
      .getByRole("status")
      .elements()
      .map((element) => element.textContent),
  ).toEqual(["Example warning", "Example note", "Example success"]);
});

/** The tokens of each tone: the tint and the dot. */
const tones: readonly { tone: BannerTone; tint: string; dot: string }[] = [
  { tone: "info", tint: "--info-bg", dot: "--info-fg" },
  { tone: "warn", tint: "--warn-bg", dot: "--warn-fg" },
  { tone: "err", tint: "--err-bg", dot: "--err-fg" },
  { tone: "ok", tint: "--ok-bg", dot: "--ok-fg" },
];

// The handoff's --t3 for the code stands 3.8:1 on the tint of an error in
// the light theme; styles/pairs.test.ts holds the pairs used instead.
test.for(["light", "dark"] as const)(
  "sets its title in --t1 and its text and code in --t2 on the tint of its tone in the %s theme",
  async (theme) => {
    root.dataset.theme = theme;
    const screen = await render(
      <>
        {tones.map(({ tone }) => (
          <Banner
            key={tone}
            tone={tone}
            title={`Title ${tone}`}
            code={`code-${tone}`}
          >
            {`Text ${tone}`}
          </Banner>
        ))}
      </>,
    );
    const colour = (text: string) =>
      getComputedStyle(screen.getByText(text).element()).color;

    for (const { tone, tint, dot } of tones) {
      expect(colour(`Title ${tone}`), tone).toBe(colourOf("--t1"));
      expect(colour(`Text ${tone}`), tone).toBe(colourOf("--t2"));
      expect(colour(`code-${tone}`), tone).toBe(colourOf("--t2"));
      const banner = screen
        .getByText(`Title ${tone}`)
        .element()
        .closest<HTMLElement>("[role]");
      expect(banner && getComputedStyle(banner).backgroundColor, tone).toBe(
        colourOf(tint),
      );
      const light = banner?.querySelector('[aria-hidden="true"]');
      expect(light && getComputedStyle(light).backgroundColor, tone).toBe(
        colourOf(dot),
      );
    }
  },
);

test("has no button to dismiss it unless it can be dismissed", async () => {
  const screen = await render(
    <Banner
      tone="info"
      title="Example note"
      actions={<button type="button">Act</button>}
    />,
  );

  expect(
    screen
      .getByRole("button")
      .elements()
      .map((button) => button.textContent),
  ).toEqual(["Act"]);
});

/** A banner that goes when it is dismissed, with what the test puts around it. */
function Dismissible({ after }: { after?: ReactNode }) {
  const [shown, setShown] = useState(true);
  return (
    <main>
      <h1 tabIndex={-1}>Example view</h1>
      {shown && (
        <Banner
          tone="info"
          title="Example note"
          onDismiss={() => {
            setShown(false);
          }}
        />
      )}
      {after}
    </main>
  );
}

/** A second banner that goes when it is dismissed, for a dialog. */
function DismissibleBanner() {
  const [shown, setShown] = useState(true);
  return (
    shown && (
      <Banner
        tone="info"
        title="Example note in a dialog"
        onDismiss={() => {
          setShown(false);
        }}
      />
    )
  );
}

// Without this the focus goes with the button, onto the body, and the
// next Tab starts at the top of the page.
test("hands the focus to what follows it when it is dismissed by the keyboard", async () => {
  const screen = await render(
    <Dismissible after={<button type="button">After the banner</button>} />,
  );

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Dismiss" }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");

  expect(screen.container.querySelector('[role="status"]')).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "After the banner" }))
    .toHaveFocus();
});

test("hands the focus to the heading of the view when nothing follows it", async () => {
  const screen = await render(<Dismissible />);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  await expect
    .element(screen.getByRole("heading", { name: "Example view" }))
    .toHaveFocus();
});

// What the inert outside of a dialog holds takes no focus, and the focus
// would land on the body, outside the dialog that is still open.
test("hands the focus to the dialog it is in when nothing in the dialog follows it", async () => {
  const screen = await render(
    <>
      <main inert>
        <h1 tabIndex={-1}>Example view</h1>
      </main>
      <div role="dialog" aria-label="Example dialog" tabIndex={-1}>
        <DismissibleBanner />
      </div>
    </>,
  );

  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Dismiss" }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect
    .element(screen.getByRole("dialog", { name: "Example dialog" }))
    .toHaveFocus();
});

test("passes over what is inert when it hands the focus on", async () => {
  const screen = await render(
    <Dismissible
      after={
        <>
          <div inert>
            <button type="button">Inert</button>
          </div>
          <button type="button">After the inert part</button>
        </>
      }
    />,
  );

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  await expect
    .element(screen.getByRole("button", { name: "After the inert part" }))
    .toHaveFocus();
});

// A screen reader announces what changes in a live region; most say
// nothing of a region that is added with its text already in it.
test("is put on the page empty and filled after, so that a reader announces it", async () => {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((list) => {
    records.push(...list);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const screen = await render(<Banner tone="info" title="Example note" />);
  const banner = screen.getByRole("status").element();
  await expect.element(banner).toHaveTextContent("Example note");
  observer.disconnect();

  expect(
    records.some(
      (record) => record.target === banner && record.addedNodes.length > 0,
    ),
  ).toBe(true);
});

// A banner dismissed with the pointer while the focus is elsewhere must
// not take the focus from where it is.
test("leaves the focus where it is when the focus was not in it", async () => {
  const screen = await render(
    <Dismissible after={<input aria-label="Elsewhere" />} />,
  );
  const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" });
  await userEvent.click(elsewhere);
  // A click from a script, which moves no focus, as a click of the
  // pointer does not in Safari.
  (
    screen.getByRole("button", { name: "Dismiss" }).element() as HTMLElement
  ).click();

  await expect
    .element(screen.getByRole("button", { name: "Dismiss" }))
    .not.toBeInTheDocument();
  await expect.element(elsewhere).toHaveFocus();
});

test("has a boundary when the system forces its colours", async () => {
  const screen = await render(<Banner tone="warn" title="Example warning" />);
  const banner = screen.getByRole("status").element();

  await forceColours(true);
  await expect
    .poll(() => matchMedia("(forced-colors: active)").matches)
    .toBe(true);

  const style = getComputedStyle(banner);
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
});
