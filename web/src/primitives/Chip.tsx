// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Toggle } from "@base-ui/react/toggle";
import type { ComponentProps, ReactNode } from "react";

import { controlSizes, cx, dimmed } from "./classes";

/** The sizes of a chip: 28 and 32 px high. */
export type ChipSize = "sm" | "md";

/**
 * The props of a chip: whether it is pressed, what happens when that
 * changes, and whatever Base UI's toggle and the native button take.
 */
export type ChipProps = Omit<
  ComponentProps<typeof Toggle>,
  | "className"
  | "style"
  | "render"
  | "children"
  | "pressed"
  | "defaultPressed"
  | "onPressedChange"
  | "value"
> & {
  /** Whether the filter is on. The caller keeps it. */
  pressed: boolean;
  /** Called with the new state when the user presses the chip. */
  onPressedChange: (pressed: boolean) => void;
  /** A number after the label, which becomes part of the name. */
  count?: number;
  /** 32 px high unless said otherwise. */
  size?: ChipSize;
  /** Classes for the layout around the chip, never for its look. */
  className?: string;
  /** The label. */
  children: ReactNode;
};

/**
 * A filter that is on or off: a button that says whether it is pressed.
 * Enter and Space press it, as any button. A row of options of which one
 * is always chosen is a SegmentedControl, and a label that cannot be
 * pressed is a Badge.
 *
 * A pressed chip has the accent as its tint, its text and its border. The
 * handoff shows the state by the tint alone, which stands 1.2:1 against
 * what is around it; the border is what marks the state at 3:1 (WCAG 2.1,
 * success criterion 1.4.11). The tint lies over the opaque surface, laid
 * there by a gradient of one colour, so that its text has the same ground
 * wherever the chip stands, and the pressed look names that surface
 * itself: the fill of the pointer would otherwise show through the tint,
 * where the text is below 4.5:1. Where the system forces its colours the
 * tint is gone and the border of a pressed chip is twice as thick.
 *
 * The count has the colour of the label. The handoff dims it to three
 * quarters, which is below 4.5:1 in the light theme (doc/ui.md lists the
 * departures).
 */
export function Chip({
  pressed,
  onPressedChange,
  count,
  size = "md",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <Toggle
      {...rest}
      pressed={pressed}
      onPressedChange={(next) => {
        onPressedChange(next);
      }}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center border font-medium whitespace-nowrap select-none",
        controlSizes[size],
        "border-bd bg-surface text-t2 hover:bg-hover hover:text-t1",
        "data-pressed:border-ac data-pressed:bg-surface data-pressed:bg-linear-to-b data-pressed:from-ac-m data-pressed:to-ac-m data-pressed:text-ac-t forced-colors:data-pressed:border-2",
        dimmed,
        className,
      )}
    >
      {children}
      {/*
        The count is a box of its own in the row, so the name of the chip
        reads "First option 12", with the space the eye sees between them.
      */}
      {count !== undefined && (
        <span className="text-[0.6875rem] tabular-nums">{count}</span>
      )}
    </Toggle>
  );
}
