// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the unit tests of the colours share: the design tokens read from
// the stylesheet, a colour laid over another, and the contrast ratio WCAG
// 2.1 defines between two. Nothing here needs a page, and only tests
// import it (doc/adr/0014-accessibility-and-browsers.md).

import stylesheet from "../styles/tokens.css?raw";

/** The themes, and the selector each declares its tokens on. */
export const selectors = {
  light: ":root",
  dark: '[data-theme="dark"]',
} as const;

/** One of the two themes. */
export type Theme = keyof typeof selectors;

/** Both themes, the light one first, as every ratio is written. */
export const themes = ["light", "dark"] as const satisfies readonly Theme[];

/** The custom properties a rule declares, by name. */
export type Declarations = Map<string, string>;

/**
 * The custom properties each selector of a stylesheet declares. It reads
 * flat rules, which is all the stylesheets of the tokens hold; a selector
 * list counts for each of its selectors, and a later rule adds to an
 * earlier one.
 */
export function customProperties(css: string): Map<string, Declarations> {
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

/** The tokens a stylesheet declares for a theme. */
export function tokensOf(css: string, theme: Theme): Declarations {
  const tokens = customProperties(css).get(selectors[theme]);
  if (!tokens || tokens.size === 0) {
    throw new Error(`no tokens found for ${selectors[theme]}`);
  }
  return tokens;
}

/**
 * What a token of sdash's stylesheet is set to in a theme, following one
 * token that refers to another. The dark theme inherits what it does not
 * declare from the light one, as the cascade does.
 */
export function valueOf(token: string, theme: Theme): string {
  const value =
    tokensOf(stylesheet, theme).get(token) ??
    tokensOf(stylesheet, "light").get(token);
  if (value === undefined) {
    throw new Error(`${token} is no token of the stylesheet`);
  }
  const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return reference ? valueOf(reference, theme) : value;
}

/** A colour: its three channels from 0 to 255, and how opaque it is. */
export interface Colour {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

/** Reads a colour as the tokens write one: #RRGGBB, or rgba(r,g,b,a). */
export function parseColour(written: string): Colour {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(written);
  if (hex) {
    const [red = 0, green = 0, blue = 0] = hex
      .slice(1)
      .map((channel) => parseInt(channel, 16));
    return { red, green, blue, alpha: 1 };
  }
  const rgba = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(
    written,
  );
  if (rgba) {
    const [red = 0, green = 0, blue = 0, alpha = 1] = rgba.slice(1).map(Number);
    return { red, green, blue, alpha };
  }
  throw new Error(`${written} is not a colour written as #RRGGBB or rgba()`);
}

/** The colour of a token in a theme. */
export function colourOf(token: string, theme: Theme): Colour {
  return parseColour(valueOf(token, theme));
}

/**
 * A colour as it shows when it is laid over an opaque one: what a tint,
 * which is translucent, looks like on the ground it lies on.
 */
export function over(top: Colour, ground: Colour): Colour {
  if (ground.alpha !== 1) {
    throw new Error("the ground a colour is laid over has to be opaque");
  }
  const mix = (above: number, below: number) =>
    above * top.alpha + below * (1 - top.alpha);
  return {
    red: mix(top.red, ground.red),
    green: mix(top.green, ground.green),
    blue: mix(top.blue, ground.blue),
    alpha: 1,
  };
}

/**
 * A colour under the filter brightness(), which is how a filled button
 * answers the pointer: every channel times the factor, and no more than
 * full.
 */
export function brightened(colour: Colour, factor: number): Colour {
  const scale = (channel: number) => Math.min(255, channel * factor);
  return {
    red: scale(colour.red),
    green: scale(colour.green),
    blue: scale(colour.blue),
    alpha: colour.alpha,
  };
}

/** The relative luminance WCAG 2.1 defines, of an opaque colour. */
export function luminance(colour: Colour): number {
  if (colour.alpha !== 1) {
    throw new Error("a colour has a luminance only once it is opaque");
  }
  const [red = 0, green = 0, blue = 0] = [
    colour.red,
    colour.green,
    colour.blue,
  ].map((channel) => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast ratio WCAG 2.1 defines between two opaque colours. */
export function contrast(one: Colour, other: Colour): number {
  const [darker = 0, lighter = 0] = [luminance(one), luminance(other)].sort(
    (a, b) => a - b,
  );
  return (lighter + 0.05) / (darker + 0.05);
}
