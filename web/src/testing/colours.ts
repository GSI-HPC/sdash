// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the component tests share to ask which colour a token has. A test
// compares what the browser computed for an element with what it computes
// for the token, so that it names the token and holds in both themes. Only
// tests import this.

/** The colour a token has on the page, written the way the browser reports it. */
export function colourOf(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}
