// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the component tests share to set what the system asks of a page: a
// contrast theme, less motion. Neither is the page's to set, so a test
// sets it through the DevTools protocol of the browser the component tests
// run in, which is Chromium alone. Only tests import this.

import { cdp } from "vitest/browser";

/** A feature of the system as the DevTools protocol names it. */
interface MediaFeature {
  readonly name: "forced-colors" | "prefers-reduced-motion";
  readonly value: string;
}

/**
 * Has the page see the given features of the system, and no other that a
 * test set before.
 *
 * Vitest leaves the type of the session to the package of its browser
 * provider, whose types bring Node's with them, and those are kept out of
 * the application's on purpose (tsconfig.app.json): hence the cast.
 */
async function emulate(features: readonly MediaFeature[]): Promise<void> {
  const session = cdp() as unknown as {
    send: (method: string, parameters: object) => Promise<unknown>;
  };
  await session.send("Emulation.setEmulatedMedia", { features });
}

/**
 * Has the browser behave as under a contrast theme of the system, or not.
 * A test that switches it on switches it off again, in an afterEach: the
 * tests of a file share one page.
 */
export async function forceColours(active: boolean): Promise<void> {
  await emulate([{ name: "forced-colors", value: active ? "active" : "none" }]);
}

/**
 * Has the page see a system that asks for less motion, or one that does
 * not. A test that asks puts it back, in a finally.
 */
export async function askForLessMotion(asked: boolean): Promise<void> {
  await emulate(
    asked ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
  );
}
