// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ComponentType, lazy, Suspense } from "react";
import {
  Link,
  MemoryRouter,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router";
import { beforeEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "../styles/index.css";
import { PageHeader } from "../layout/PageHeader";
import { focused, settled } from "../testing/app";
import { ArrivalProvider } from "./arrival";
import { ViewBoundary } from "./ViewBoundary";

// Arriving at a view when the view does not simply show (arrival.tsx): its
// file is still on the way, or cannot be fetched, or the view fails. The
// arrivals that go well are tested on the whole application, in
// layout/Shell.browser.test.tsx. Here the views are made for the test, so
// that it decides when a file arrives and whether it does.

beforeEach(() => {
  document.title = "";
});

/** A view as every view is one: it starts with the page header. */
function view(title: string): ComponentType {
  return function View() {
    return <PageHeader title={title} summary={`What ${title} shows.`} />;
  };
}

/** A view whose file arrives when the test says so. */
function late(title: string): { View: ComponentType; arrive: () => void } {
  let arrive: () => void = () => undefined;
  const fetched = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const View = lazy(async () => {
    await fetched;
    return { default: view(title) };
  });
  return { View, arrive };
}

/** A view whose file cannot be fetched, in the words Chromium has for it. */
function missing(): ComponentType {
  return lazy<ComponentType>(() =>
    Promise.reject(
      new TypeError("Failed to fetch dynamically imported module: Nodes.js"),
    ),
  );
}

/** A view that was fetched and fails when it is drawn. */
function Faulty(): never {
  throw new TypeError("Cannot read properties of undefined");
}

/**
 * The views by their addresses, inside what the application puts around a
 * view (App.tsx): the provider, the boundary and the wait for the file.
 * A link leads to each view, and a button goes back.
 */
function Page({ views }: { views: Record<string, ComponentType> }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const View = views[pathname];

  return (
    <ArrivalProvider>
      <nav>
        {Object.keys(views).map((path) => (
          <Link key={path} to={path}>
            To {path}
          </Link>
        ))}
        <button type="button" onClick={() => void navigate(-1)}>
          Back
        </button>
      </nav>
      <main>
        <ViewBoundary at={pathname}>
          <Suspense fallback={null}>{View && <View />}</Suspense>
        </ViewBoundary>
      </main>
    </ArrivalProvider>
  );
}

/** Renders the page as one that was loaded at the first of the addresses. */
function renderPage(
  views: Record<string, ComponentType>,
  router: { useTransitions?: boolean } = {},
) {
  const [first = "/"] = Object.keys(views);
  return render(
    <MemoryRouter initialEntries={[first]} {...router}>
      <Page views={views} />
    </MemoryRouter>,
  );
}

type Screen = Awaited<ReturnType<typeof renderPage>>;

function heading(screen: Screen, name: string) {
  return screen.getByRole("heading", { level: 1, name });
}

describe("arriving at a view that failed", () => {
  // The view never got to name the document or to take the focus. Left at
  // that, the tab would keep the title of the view before, the focus would
  // stay on the link, and a screen reader user would not learn where the
  // link led. And the way back would move no focus either: as far as the
  // page headers knew, the user had never left.
  test.each([
    {
      how: "could not be fetched",
      view: missing,
      says: "This view did not load",
    },
    {
      how: "failed when it was drawn",
      view: () => Faulty,
      says: "This view failed",
    },
  ])(
    "because it $how puts the focus on the report and names the document after it",
    async ({ view: failing, says }) => {
      const screen = await renderPage({
        "/overview": view("Overview"),
        "/nodes": failing(),
      });
      await expect.element(heading(screen, "Overview")).toBeVisible();

      await screen.getByRole("link", { name: "To /nodes" }).click();

      const report = screen.getByRole("alert").getByRole("heading", {
        level: 1,
        name: says,
      });
      await expect.element(report).toHaveFocus();
      expect(document.title).toBe(`${says} - sdash`);

      // Back at the view the user came from, which is arrived at anew.
      await screen.getByRole("button", { name: "Back" }).click();

      await expect.element(heading(screen, "Overview")).toHaveFocus();
      expect(document.title).toBe("Overview - sdash");
    },
  );

  // A view that fails on the page that was loaded with it is no arrival:
  // the alert says what happened, and the focus stays at the top.
  test("on the page that was loaded with it names the document and leaves the focus at the top", async () => {
    const screen = await renderPage({ "/nodes": missing() });

    await expect
      .element(heading(screen, "This view did not load"))
      .toBeVisible();
    await settled();
    expect(document.title).toBe("This view did not load - sdash");
    expect(focused()).toBe(document.body);
  });
});

describe("arriving at a view whose file is still on the way", () => {
  // A user who knows the keys is faster than the first view. The view
  // that then arrives is the first to show a heading, and it was still
  // navigated to: the focus goes to it.
  test("before the first view has shown puts the focus on the heading when it comes", async () => {
    const overview = late("Overview");
    const nodes = late("Nodes");
    const screen = await renderPage({
      "/overview": overview.View,
      "/nodes": nodes.View,
    });
    // The premise: nothing shows yet.
    expect(screen.getByRole("heading").elements()).toEqual([]);

    await screen.getByRole("link", { name: "To /nodes" }).click();
    await settled();
    expect(screen.getByRole("heading").elements()).toEqual([]);
    nodes.arrive();

    await expect.element(heading(screen, "Nodes")).toHaveFocus();
    expect(document.title).toBe("Nodes - sdash");

    // The file of the view that was left arrives after all, and changes
    // nothing.
    overview.arrive();
    await settled();
    await expect.element(heading(screen, "Nodes")).toHaveFocus();
    expect(document.title).toBe("Nodes - sdash");
  });

  // The same on a page that was opened at the root address, which leads
  // on to the Overview. React holds that step back for as long as the
  // Overview is being fetched, so the user is seen to go from the root
  // straight to the other view, and that must not pass for being led on.
  test("before the view the root leads to has shown puts the focus on the heading when it comes", async () => {
    const overview = late("Overview");
    const nodes = late("Nodes");
    const screen = await renderPage({
      "/": () => <Navigate to="/overview" replace />,
      "/overview": overview.View,
      "/nodes": nodes.View,
    });
    await settled();

    await screen.getByRole("link", { name: "To /nodes" }).click();
    nodes.arrive();

    await expect.element(heading(screen, "Nodes")).toHaveFocus();
    expect(document.title).toBe("Nodes - sdash");
  });

  // Being led on from the root is part of loading the page, however long
  // the view takes.
  test("by being led on from the root leaves the focus at the top", async () => {
    const overview = late("Overview");
    const screen = await renderPage({
      "/": () => <Navigate to="/overview" replace />,
      "/overview": overview.View,
    });
    await settled();

    overview.arrive();

    await expect.element(heading(screen, "Overview")).toBeVisible();
    await settled();
    expect(focused()).toBe(document.body);
    expect(document.title).toBe("Overview - sdash");
  });

  test("from a view that shows puts the focus on the heading when it comes", async () => {
    const nodes = late("Nodes");
    const screen = await renderPage({
      "/overview": view("Overview"),
      "/nodes": nodes.View,
    });
    await expect.element(heading(screen, "Overview")).toBeVisible();

    await screen.getByRole("link", { name: "To /nodes" }).click();
    await settled();
    nodes.arrive();

    await expect.element(heading(screen, "Nodes")).toHaveFocus();
    expect(document.title).toBe("Nodes - sdash");
  });

  // Without a transition React puts the view that is left out of sight at
  // once and keeps it on the page until the next one is there. Its heading
  // is then still registered, and must not be taken for the heading of the
  // address that shows: the focus would go to an element nobody sees, and
  // the arrival would count as made.
  test("is not taken by the heading of the view that is left", async () => {
    const nodes = late("Nodes");
    const screen = await renderPage(
      { "/overview": view("Overview"), "/nodes": nodes.View },
      { useTransitions: false },
    );
    await expect.element(heading(screen, "Overview")).toBeVisible();

    await screen.getByRole("link", { name: "To /nodes" }).click();
    await settled();
    // The premise: the view that is left is out of sight and still there.
    const left = screen.getByRole("heading", { includeHidden: true });
    await expect.element(left).toHaveTextContent("Overview");
    await expect.element(left).not.toBeVisible();
    nodes.arrive();

    await expect.element(heading(screen, "Nodes")).toHaveFocus();
  });

  // The page that was loaded is announced by the browser, however long
  // its view takes.
  test("on the page that was loaded leaves the focus at the top", async () => {
    const nodes = late("Nodes");
    const screen = await renderPage({ "/nodes": nodes.View });
    await settled();

    nodes.arrive();

    await expect.element(heading(screen, "Nodes")).toBeVisible();
    await settled();
    expect(focused()).toBe(document.body);
    expect(document.title).toBe("Nodes - sdash");
  });
});
