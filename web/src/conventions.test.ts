// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

// Rules of the frontend that a reviewer would otherwise have to remember,
// checked by reading the sources (AGENTS.md, "Code conventions";
// doc/adr/0026-ui-primitives-on-base-ui.md). Each is a rule about what a
// file may hold, which no type and no lint rule of the project states.

/** Every source file under web/src, by its path from there, as text. */
const sources = Object.entries(
  import.meta.glob<string>("./**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
).map(([path, text]) => ({ path, text }));

/** Whether a file is a test, or shared by tests alone. */
function isTest(path: string): boolean {
  return /\.test\.tsx?$/.test(path) || path.startsWith("./testing/");
}

/**
 * A source without its comments, which may speak of what the code must
 * not hold. Crude on purpose: it also cuts a string off at "//", which
 * only ever removes text.
 */
function withoutComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/.*$/gm, "");
}

/** Which opening tags to read: those of elements, or of components too. */
const tagStart = {
  elements: /<[a-z][a-z0-9]*[\s>/]/g,
  all: /<[A-Za-z][\w.]*[\s>/]/g,
} as const;

/**
 * The opening tags in a source, each from its name to the ">" that ends
 * it. Braces are followed, because an attribute may hold an arrow
 * function, whose ">" ends nothing.
 */
function openingTags(text: string, which: keyof typeof tagStart): string[] {
  const tags: string[] = [];
  for (const { index } of text.matchAll(tagStart[which])) {
    let depth = 0;
    let end = index + 1;
    for (; end < text.length; end++) {
      const character = text[end];
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
      } else if (character === ">" && depth === 0) {
        break;
      }
    }
    tags.push(text.slice(index, end + 1));
  }
  return tags;
}

/**
 * The opening tags of a source that have the given attribute. A component
 * may take a prop of any name, so `which` says whether components count.
 */
function tagsWith(
  attribute: string,
  text: string,
  which: keyof typeof tagStart,
): string[] {
  const named = new RegExp(`\\s${attribute}\\s*=`);
  return openingTags(withoutComments(text), which).filter((tag) =>
    named.test(attributeNames(tag)),
  );
}

/** What a colour that is no design token looks like in a source. */
const colourLiteral =
  /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/i;

/** The lines of a source that hold a colour that is no design token. */
function linesWithColour(text: string): string[] {
  return withoutComments(text)
    .split("\n")
    .filter((line) => colourLiteral.test(line))
    .map((line) => line.trim());
}

/** An opening tag without what its attributes hold in braces or quotes. */
function attributeNames(tag: string): string {
  let names = "";
  let depth = 0;
  let quote = "";
  for (const character of tag) {
    if (quote) {
      quote = character === quote ? "" : quote;
    } else if (depth === 0 && (character === '"' || character === "'")) {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    } else if (depth === 0) {
      names += character;
    }
  }
  return names;
}

// The premise of every test below: the sources were found and read.
test("the sources of web/src are read as text", () => {
  const app = sources.find(({ path }) => path === "./App.tsx");

  expect(sources.length).toBeGreaterThan(100);
  expect(app?.text).toContain("export function App");
});

// A view composes primitives, and cannot go around what they see to: the
// names, the focus, the contrast, the server's Content-Security-Policy.
test("nothing outside primitives/ imports Base UI", () => {
  const importing = sources
    .filter(({ text }) => /["']@base-ui\//.test(withoutComments(text)))
    .map(({ path }) => path);

  expect(importing.length).toBeGreaterThan(0);
  expect(importing.filter((path) => !path.startsWith("./primitives/"))).toEqual(
    [],
  );
});

// A primitive knows nothing of the shell, the views or the browser API, so
// that it can be used by all of them. What it does take from outside its
// directory is listed here.
test("a primitive imports nothing of the application but icons, shortcuts and the scroll hook", () => {
  const allowed = [
    /^\.\//,
    /^\.\.\/icons\//,
    /^\.\.\/shortcuts\//,
    /^\.\.\/layout\/useKeyboardScroll$/,
  ];
  const foreign = sources
    .filter(({ path }) => path.startsWith("./primitives/") && !isTest(path))
    .flatMap(({ path, text }) =>
      [...withoutComments(text).matchAll(/from\s+["'](\.[^"']*)["']/g)]
        .map(([, from = ""]) => from)
        .filter((from) => !allowed.some((pattern) => pattern.test(from)))
        .map((from) => `${path} imports ${from}`),
    );

  expect(foreign).toEqual([]);
});

describe("no source file", () => {
  // A tooltip is the Tooltip primitive. The native attribute is out of
  // reach of the keyboard and of a touch screen, and a browser shows it
  // when it likes. A component may take a prop called title; an element
  // must not.
  test("gives an element a title attribute", () => {
    const titled = sources.flatMap(({ path, text }) =>
      tagsWith("title", text, "elements").map((tag) => `${path}: ${tag}`),
    );

    expect(titled).toEqual([]);
  });

  // The server's Content-Security-Policy allows a style that a script
  // sets and none in the markup, and no primitive takes one: a look is a
  // class, which the stylesheet holds for both themes.
  test("gives an element or a component a style", () => {
    const styled = sources
      .filter(({ path }) => !isTest(path))
      .flatMap(({ path, text }) =>
        tagsWith("style", text, "all").map((tag) => `${path}: ${tag}`),
      );

    expect(styled).toEqual([]);
  });

  // A colour comes from a design token, which has a value for each theme.
  // A literal one would stay as it is when the theme changes. The tests
  // are left out: they compare with what the browser reports, which is a
  // literal. So is the generated api/, which holds no colour and may hold
  // any text.
  test("holds a colour that is no design token", () => {
    const coloured = sources
      .filter(({ path }) => !isTest(path) && !path.startsWith("./api/"))
      .flatMap(({ path, text }) =>
        linesWithColour(text).map((line) => `${path}: ${line}`),
      );

    expect(coloured).toEqual([]);
  });
});

// What the readers above make of a source, shown on sources that break
// each rule: a reader that finds nothing would pass every file.
describe("the readers", () => {
  test("find an attribute of an element, and not what only looks like one", () => {
    const titled = (source: string) => tagsWith("title", source, "elements");

    expect(titled('<button title="Save">')).toHaveLength(1);
    expect(titled("<abbr\n  title={name}\n>")).toHaveLength(1);
    expect(
      titled('<button onClick={() => { save(a > b); }} title="Save">'),
    ).toHaveLength(1);
    // A component may take a prop of that name, an element no attribute.
    expect(titled('<DialogHeader title="Example dialog" />')).toEqual([]);
    expect(titled('<input aria-label="The title = the name" />')).toEqual([]);
    expect(titled("<p>{`title=${title}`}</p>")).toEqual([]);
    expect(titled('// <button title="Save">')).toEqual([]);
  });

  test("find a style on an element and on a component", () => {
    const styled = (source: string) => tagsWith("style", source, "all");

    expect(styled("<div style={{ top: 0 }}>")).toHaveLength(1);
    expect(styled("<Button\n  style={look}\n/>")).toHaveLength(1);
    expect(styled('<Base.Popup className="fixed" style={look}>')).toHaveLength(
      1,
    );
    expect(styled('<div className="style = none">')).toEqual([]);
  });

  test("find a colour written out, in whatever notation, and no token", () => {
    expect(linesWithColour('"bg-[#fff]"')).toHaveLength(1);
    expect(linesWithColour('"text-[#1A1C20]"')).toHaveLength(1);
    expect(linesWithColour("color: rgba(0, 0, 0, 0.5)")).toHaveLength(1);
    expect(linesWithColour('"bg-[hsl(210_40%_50%)]"')).toHaveLength(1);
    expect(
      linesWithColour('"bg-surface text-(color:--t3) bg-ac-l/45"'),
    ).toEqual([]);
    expect(linesWithColour("to={{ hash: `#${id}` }}")).toEqual([]);
    expect(linesWithColour("// white is #fff")).toEqual([]);
  });
});
