// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import prototype from "../../../doc/design/sdash.dc.html?raw";
import stylesheet from "./tokens.css?raw";

// The selectors the prototype declares its tokens on, by theme.
const selectors = { light: ":root", dark: '[data-theme="dark"]' } as const;
const themes = ["light", "dark"] as const;

// The tokens sdash adds to the prototype's; tokens.css says why each exists.
const added = ["--focus"];

// The tokens whose value departs from the prototype's on purpose, each with
// its reason. Accessibility is added to the design by a contrast pass over
// the token values (doc/adr/0014-accessibility-and-browsers.md). A value
// that pass changes is changed in tokens.css and listed here; the handoff is
// kept as it was delivered and is not edited to match.
const changed: Record<string, string> = {};

// The tokens a focus ring can lie on.
const backgrounds = [
  "--bg-base",
  "--bg-surface",
  "--bg-elevated",
  "--bg-hover",
  "--bg-active",
];

type Declarations = Map<string, string>;

/**
 * The custom properties each selector of a stylesheet declares. It reads
 * flat rules, which is all the two sources hold; a selector list counts for
 * each of its selectors, and a later rule adds to an earlier one.
 */
function customProperties(css: string): Map<string, Declarations> {
  const rules = new Map<string, Declarations>();
  const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selectorList = "", body = ""] of withoutComments.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    for (const selector of selectorList.split(",")) {
      const name = selector.trim();
      const declarations = rules.get(name) ?? new Map<string, string>();
      for (const declaration of body.split(";")) {
        const colon = declaration.indexOf(":");
        const property = declaration.slice(0, colon).trim();
        if (colon > 0 && property.startsWith("--")) {
          declarations.set(property, declaration.slice(colon + 1).trim());
        }
      }
      rules.set(name, declarations);
    }
  }
  return rules;
}

function tokensOf(css: string, theme: (typeof themes)[number]): Declarations {
  const tokens = customProperties(css).get(selectors[theme]);
  if (!tokens || tokens.size === 0) {
    throw new Error(`no tokens found for ${selectors[theme]}`);
  }
  return tokens;
}

const prototypeStyle = /<style>([\s\S]*?)<\/style>/.exec(prototype)?.[1] ?? "";

/**
 * A token's colour in a theme, following one token that refers to another.
 * The dark theme inherits what it does not declare from the light one, as
 * the cascade does.
 */
function colourOf(token: string, theme: (typeof themes)[number]): string {
  const value =
    tokensOf(stylesheet, theme).get(token) ??
    tokensOf(stylesheet, "light").get(token) ??
    "";
  const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return reference ? colourOf(reference, theme) : value;
}

/** The relative luminance WCAG 2.1 defines, of a colour written #RRGGBB. */
function luminance(colour: string): number {
  const channels = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (!channels) {
    throw new Error(`${colour} is not a colour written as #RRGGBB`);
  }
  const [red = 0, green = 0, blue = 0] = channels.slice(1).map((channel) => {
    const share = parseInt(channel, 16) / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast ratio WCAG 2.1 defines between two colours. */
function contrast(one: string, other: string): number {
  const [darker = 0, lighter = 0] = [luminance(one), luminance(other)].sort(
    (a, b) => a - b,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// A departure that is listed and no longer one would hide the next change to
// that token, and one without a reason says nothing to whoever reads it.
//
// The prototype declares some tokens for the light theme alone, and the dark
// theme inherits them. A token is therefore compared in the themes the
// prototype declares it for; one it declares for neither differs nowhere,
// and fails here as a token the prototype does not have.
test("every listed departure names a token of the prototype, differs from it and says why", () => {
  for (const [token, reason] of Object.entries(changed)) {
    expect(reason, token).not.toBe("");
    const differs = themes.flatMap((theme) => {
      const designed = tokensOf(prototypeStyle, theme).get(token);
      return designed === undefined
        ? []
        : [tokensOf(stylesheet, theme).get(token) !== designed];
    });
    expect(differs, token).toContain(true);
  }
});

describe.each(themes)("the %s theme", (theme) => {
  // The design is the source of the token values. A value differs from the
  // prototype's only when the token is listed in changed with its reason, so
  // that the built UI does not drift from the handoff without anyone having
  // decided it.
  test("has every token of the prototype, with its value unless a departure is listed", () => {
    const expected = tokensOf(prototypeStyle, theme);
    const actual = tokensOf(stylesheet, theme);

    for (const [token, value] of expected) {
      if (Object.hasOwn(changed, token)) {
        expect(actual.has(token), token).toBe(true);
        continue;
      }
      expect(actual.get(token), token).toBe(value);
    }
  });

  // The other direction: a token invented here would look like part of the
  // design. What sdash adds is listed above, with its reason in tokens.css.
  test("has no token the prototype lacks, apart from sdash's own", () => {
    const expected = [...tokensOf(prototypeStyle, theme).keys(), ...added];
    const actual = [...tokensOf(stylesheet, theme).keys()];

    expect(actual.toSorted()).toEqual(expected.toSorted());
  });

  // WCAG 2.1 asks for 3:1 between a focus indicator and what it lies on
  // (success criterion 1.4.11). The ring's colour refers to an accent token,
  // so a change to the palette could take the ring below that unnoticed.
  test("has a focus ring that stands 3:1 against every background", () => {
    const ring = colourOf("--focus", theme);

    for (const background of backgrounds) {
      expect(
        contrast(ring, colourOf(background, theme)),
        background,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
