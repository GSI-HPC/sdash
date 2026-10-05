// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/paths";
import { useAriaKeyShortcuts } from "../shortcuts/useShortcuts";
import {
  type ControlSize,
  cx,
  dimmedWithin,
  iconSizes,
  squareSizes,
} from "./classes";
import { Tooltip, type TooltipSide } from "./Tooltip";

// Each look names, for the disabled state, what its hover would change: a
// disabled button dims its icon and not itself (dimmedWithin in
// classes.ts), and with the fill of the hover at full strength it would
// look like a button that works.
const variants = {
  secondary:
    "border-bd bg-surface text-t2 hover:bg-hover hover:text-t1 data-disabled:bg-surface data-disabled:text-t2",
  ghost:
    "border-transparent text-t2 hover:bg-hover hover:text-t1 data-disabled:bg-transparent data-disabled:text-t2",
} as const;

// The look of a toggle that is pressed. It is written after the hover of
// each variant and so holds under the pointer. Pressed and disabled, it
// has to say so with both conditions, or the disabled classes of the
// variant would take the fill away; the fill then fades as the icon does.
const pressedLook =
  "aria-pressed:border-transparent aria-pressed:bg-ac-l aria-pressed:text-(color:--bg-surface) forced-colors:aria-pressed:border-2 data-disabled:aria-pressed:bg-ac-l/45 data-disabled:aria-pressed:text-(color:--bg-surface)";

/** The looks of an icon button: bordered, or the icon alone. */
export type IconButtonVariant = keyof typeof variants;

// What a caller may hand on to the button element. The name, the state
// and the key are not among it: they come from `label`, `pressed` and
// `keys`, so that the attribute and what the tooltip shows cannot differ.
type NativeProps = Omit<
  ComponentProps<typeof BaseButton>,
  | "className"
  | "style"
  | "render"
  | "children"
  | "aria-label"
  | "aria-pressed"
  | "aria-keyshortcuts"
>;

/**
 * The props of an icon button: its icon and its name, its look, and
 * whatever Base UI's button and the native element take.
 */
export type IconButtonProps = NativeProps & {
  /** The icon, which is all the button shows. */
  icon: IconName;
  /** The name of the button, and what its tooltip says. */
  label: string;
  /**
   * A shortcut that does what the button does. It shows in the tooltip,
   * and assistive technology is told of it, while the shortcut works.
   */
  keys?: string;
  /** Bordered unless said otherwise. */
  variant?: IconButtonVariant;
  /** A square of one of the four heights; 32 px unless said otherwise. */
  size?: ControlSize;
  /** Makes the button a toggle that says whether it is pressed. */
  pressed?: boolean;
  /** The side its tooltip shows on; below unless said otherwise. */
  tooltipSide?: TooltipSide;
  /** Classes for the layout around the button, never for its look. */
  className?: string;
};

/**
 * The button with its key told to assistive technology. A component of
 * its own, because the hook that knows whether the key works at the
 * moment cannot be asked about a key that is not there.
 */
function KeyedButton({
  keys,
  ...button
}: ComponentProps<typeof BaseButton> & { keys: string }) {
  return (
    <BaseButton {...button} aria-keyshortcuts={useAriaKeyShortcuts(keys)} />
  );
}

/**
 * A button that shows an icon and no text. Its label is its name to
 * assistive technology, and a tooltip shows the same words to whoever
 * points at it or reaches it by keyboard: what a control is called has to
 * be what someone who speaks to the computer can read off it (WCAG 2.1,
 * success criterion 2.5.3).
 *
 * With `pressed` it is a toggle. The handoff fills a pressed one with --ac
 * and draws its icon in white, which is no token and below 3:1 in the dark
 * theme; here the fill is --ac-l and the icon --bg-surface (doc/ui.md
 * lists the departures). Where the system forces its colours the fill is
 * gone and the border of a pressed button is twice as thick.
 *
 * A button that is disabled with the native attribute gets no events and
 * shows no tooltip. One that should still say what it is sets
 * `focusableWhenDisabled` as well. A reason for being disabled is not
 * something it can show yet: a second tooltip around it would lie over
 * its own.
 */
export function IconButton({
  icon,
  label,
  keys,
  variant = "secondary",
  size = "md",
  pressed,
  tooltipSide = "bottom",
  className,
  ...rest
}: IconButtonProps) {
  const button = {
    ...rest,
    "aria-label": label,
    ...(pressed === undefined ? {} : { "aria-pressed": pressed }),
    className: cx(
      "inline-flex shrink-0 cursor-pointer items-center justify-center border select-none",
      squareSizes[size],
      variants[variant],
      pressedLook,
      dimmedWithin,
      className,
    ),
  };
  const drawing = <Icon name={icon} className={iconSizes[size]} />;

  return keys === undefined ? (
    <Tooltip label={label} side={tooltipSide}>
      <BaseButton {...button}>{drawing}</BaseButton>
    </Tooltip>
  ) : (
    <Tooltip label={label} keys={keys} side={tooltipSide}>
      <KeyedButton {...button} keys={keys}>
        {drawing}
      </KeyedButton>
    </Tooltip>
  );
}
