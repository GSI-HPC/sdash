// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import prototype from "../../../doc/design/sdash.dc.html?raw";
import { colourOf, contrast, themes, tokensOf } from "../testing/contrast";
import stylesheet from "./tokens.css?raw";

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

const prototypeStyle = /<style>([\s\S]*?)<\/style>/.exec(prototype)?.[1] ?? "";

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
