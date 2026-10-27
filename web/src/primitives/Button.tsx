// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactNode } from "react";

import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/paths";
import {
  type ControlSize,
  controlSizes,
  cx,
  dimmedWithin,
  iconSizes,
} from "./classes";

// The looks of a button, by variant and by tone. Each is a complete list
// of classes, the weight of its text included, so that no two utilities of
// one button set the same property: which of two would win is decided by
// the order of the stylesheet and not by the order they are written in.
//
// The handoff fills its primary button with --ac and its destructive one
// with --err and sets white on both, which is no token and below 4.5:1 in
// both themes. Here the fill is --ac-l or --err-fg and the text
// --bg-surface (doc/ui.md lists the departures). Under the pointer and
// while pressed a filled button changes its brightness, as the handoff
// does for its toned buttons, and keeps 4.5:1 in both.
//
// The soft destructive button lays its tint over the opaque surface with
// a gradient of one colour. The tint is translucent: alone, its text
// would stand on whatever lies behind the button, and on a row under the
// pointer that is below 4.5:1.
//
// A variant never pairs "hover:" with a second condition. Two conditions
// outweigh the one of a state, and the pointer would then undo the look of
// a button that is pressed or open.
//
// A disabled button dims what it holds and not itself (dimmedWithin in
// classes.ts). A filled one fades its fill by the same measure. Its text
// is then dimmed on a fill that is dimmed too, and so stands fainter
// against the fill than in the handoff, which dimmed the two as one: 1.38
// and 1.62 to 1 in the two themes, where the handoff has 1.78 and 1.93. A
// disabled control is exempt from the contrast of text (WCAG 2.1, success
// criterion 1.4.3); doc/ui.md lists the difference. Each look also names,
// for the disabled state, what its hover would change: the handoff lets a
// disabled button answer the pointer, dimmed, and undimmed that would
// look like a button that works.
const looks = {
  primary: {
    default:
      "border-transparent bg-ac-l font-semibold text-(color:--bg-surface) hover:brightness-108 active:brightness-92 data-disabled:bg-ac-l/45 data-disabled:brightness-100",
    danger:
      "border-transparent bg-err-fg font-semibold text-(color:--bg-surface) hover:brightness-108 active:brightness-92 data-disabled:bg-err-fg/45 data-disabled:brightness-100",
  },
  secondary: {
    default:
      "border-bd bg-surface font-medium text-t1 hover:bg-hover active:bg-active data-disabled:bg-surface",
    danger:
      "border-transparent bg-surface bg-linear-to-b from-err-bg to-err-bg font-medium text-err-fg hover:border-err-fg data-disabled:border-transparent",
  },
  ghost: {
    default:
      "border-transparent font-medium text-ac-t hover:underline data-disabled:no-underline",
    danger:
      "border-transparent font-medium text-err-fg hover:underline data-disabled:no-underline",
  },
} as const;

/** The looks of a button: filled, bordered, or text alone. */
export type ButtonVariant = keyof typeof looks;

/** What a button is about: an action like any other, or one that destroys. */
export type ButtonTone = keyof (typeof looks)[ButtonVariant];

/**
 * The props of a button: its look, and whatever Base UI's button and the
 * native element take. `className` is for layout alone, a margin or a
 * width; the look is chosen by `variant`, `tone` and `size`.
 */
export type ButtonProps = Omit<
  ComponentProps<typeof BaseButton>,
  "className" | "style" | "render" | "children"
> & {
  /** Filled, bordered or text alone. Bordered unless said otherwise. */
  variant?: ButtonVariant;
  /** "danger" for an action that deletes or cancels something. */
  tone?: ButtonTone;
  /** One of the four heights of a control; 32 px unless said otherwise. */
  size?: ControlSize;
  /** An icon before the text. */
  icon?: IconName;
  /** An icon after the text, the arrow of a button that opens a menu. */
  iconEnd?: IconName;
  /** Classes for the layout around the button, never for its look. */
  className?: string;
  /** The text, which is the name of the button. */
  children: ReactNode;
};

/**
 * A button with text: the control for an action. Its text is its name. A
 * button that shows an icon and nothing else is an IconButton, which has
 * a label in place of the text.
 *
 * It is a native button, so Enter and Space press it. A transparent border
 * on the variants that show none gives each a boundary where the system
 * forces its colours and removes every fill.
 *
 * `disabled` takes it out of the order of the Tab key. A button whose
 * reason for being disabled the user should learn sets
 * `focusableWhenDisabled` as well: it then keeps its place, says that it
 * is disabled, does nothing when pressed, and can carry the reason as a
 * Tooltip of the kind "description". Either way it looks the same, and
 * the ring of the focus is as strong on it as on any button.
 */
export function Button({
  variant = "secondary",
  tone = "default",
  size = "md",
  icon,
  iconEnd,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <BaseButton
      {...rest}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center border whitespace-nowrap select-none",
        controlSizes[size],
        looks[variant][tone],
        dimmedWithin,
        className,
      )}
    >
      {icon && <Icon name={icon} className={iconSizes[size]} />}
      {/* An element, so that a disabled button can dim it. */}
      <span>{children}</span>
      {iconEnd && <Icon name={iconEnd} className={iconSizes[size]} />}
    </BaseButton>
  );
}
