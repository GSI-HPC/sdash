// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the component tests share to look at tooltips. A tooltip that names
// its control is hidden from assistive technology and has no role to find
// it by, and it is not inside its control but where the popups of the page
// go: the tests find it by the one attribute primitives/Tooltip.tsx gives
// every tooltip. Only tests import this.

/** Every tooltip on the page, shown or not. */
export function tooltips(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="tooltip"]')];
}

/**
 * Whether a tooltip can be seen. A tooltip that is closed is gone from the
 * page or kept in a hidden element, and one whose control was scrolled out
 * of sight is on the page and invisible.
 */
function shown(tooltip: HTMLElement): boolean {
  return tooltip.checkVisibility({ visibilityProperty: true });
}

/** The tooltips that show at this moment. */
export function shownTooltipElements(): HTMLElement[] {
  return tooltips().filter(shown);
}

/**
 * What the tooltips that show at this moment say: the label, and after it
 * the key caps where the tooltip shows a shortcut.
 */
export function shownTooltips(): string[] {
  return shownTooltipElements().map((tooltip) => tooltip.textContent);
}
