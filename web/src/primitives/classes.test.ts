// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { controlSizes, cx, iconSizes, squareSizes } from "./classes";

// A primitive writes a condition into the list of its classes, as
// `mono && "font-mono"` or as an optional className of its caller. What is
// false or missing must leave no trace: the word "false" or "undefined" in
// a class attribute is a class nobody meant.
test("joins the names it is given and leaves out what is false or missing", () => {
  expect(cx("flex", "gap-2")).toBe("flex gap-2");
  expect(cx("flex", false, null, undefined, "", "gap-2")).toBe("flex gap-2");
  expect(cx()).toBe("");
  expect(cx(false, undefined)).toBe("");
});

// A control picks its box from one scale and the icon inside it from
// another by the same name. A size that one of them lacked would give a
// control with no height, or an icon as large as its drawing.
test("has a class string for every size in each scale", () => {
  const sizes = Object.keys(controlSizes).sort();

  expect(sizes).toEqual(["lg", "md", "sm", "xs"]);
  expect(Object.keys(squareSizes).sort()).toEqual(sizes);
  expect(Object.keys(iconSizes).sort()).toEqual(sizes);
  for (const scale of [controlSizes, squareSizes, iconSizes]) {
    for (const classes of Object.values(scale)) {
      expect(classes.trim()).not.toBe("");
    }
  }
});
