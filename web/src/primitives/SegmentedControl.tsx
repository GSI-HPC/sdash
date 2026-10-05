// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cx } from "./classes";

// The sizes, by the size of the control: its track, and a segment in it.
// With the 2 px of the track on either side, a control of the size "sm"
// is as high as a button of that size, 28 px, and one of the size "md"
// 32 px.
//
// The handoff has two. On the page its segments are 28 px high, in a track
// of 34 px with a border in --bd: that is "md", whose border takes one of
// the track's 2 px, so that the control is 32 px high and stands level
// with a button. In the status popover they are 20 px high, in a track of
// 24 px without a border: that is "sm", with segments of 24 px, since one
// of 20 px is harder to hit than any other control (doc/ui.md lists the
// departures).
const sizes = {
  sm: { track: "p-0.5", segment: "h-6 text-[0.6875rem]" },
  md: { track: "border border-bd p-px", segment: "h-7 text-xs" },
} as const;

/**
 * The sizes of a segmented control: 28 and 32 px high, as a button and a
 * field of the same size are.
 */
export type SegmentedControlSize = keyof typeof sizes;

/** One of the options of a segmented control. */
export interface SegmentedControlOption<Value extends string> {
  /** What choosing the option reports. */
  readonly value: Value;
  /** What the segment says, which is its name. */
  readonly label: string;
}

/** The props of a segmented control. */
export interface SegmentedControlProps<Value extends string> {
  /** The name of the group: what the options are a choice of. */
  label: string;
  /** The options, in the order of the row. */
  options: readonly SegmentedControlOption<Value>[];
  /** The chosen option. There always is one. */
  value: Value;
  /** Called with the value of the option the user chose. */
  onValueChange: (value: Value) => void;
  /** 32 px high unless said otherwise. */
  size?: SegmentedControlSize;
  /** Classes for the layout around the control, never for its look. */
  className?: string;
}

/**
 * A row of options of which one is always chosen: what a view is coloured
 * by, the range of a chart. It is a radio group, which says exactly that,
 * and not a group of toggle buttons, where a pressed one can be released
 * and none is left. A filter that is on or off by itself is a Chip.
 *
 * The keys are those of WAI-ARIA's radio group: the Tab key stops once, on
 * the chosen option; the arrow keys move the choice and wrap at the ends;
 * Space chooses. The choice changes with the arrow, so a view has to make
 * a change of it cheap.
 *
 * A segment is addressed by its role and its name. An id given to one
 * would land on the hidden input Base UI keeps for a form.
 *
 * The row goes on in a second line where it is too long for its place, as
 * on a page enlarged to four times its size, and the arrow keys keep to
 * the order of the options.
 *
 * The handoff marks the chosen segment by the surface colour on the
 * elevated track, 1.1:1, and a shadow. The border in the accent is the
 * indicator that reaches 3:1 (WCAG 2.1, success criterion 1.4.11), and it
 * is twice as thick where the system forces its colours and paints every
 * border alike. The other segments are --t2: the handoff's --t3 is below
 * 4.5:1 on the track in the light theme.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "md",
  className,
}: SegmentedControlProps<Value>) {
  return (
    <RadioGroup<Value>
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        onValueChange(next);
      }}
      className={cx(
        "inline-flex max-w-full flex-wrap rounded-md bg-elevated",
        sizes[size].track,
        className,
      )}
    >
      {options.map((option) => (
        <Radio.Root<Value>
          key={option.value}
          value={option.value}
          className={cx(
            "inline-flex cursor-pointer items-center rounded-sm border border-transparent px-2.5 font-medium whitespace-nowrap text-t2 select-none hover:text-t1 data-checked:border-ac data-checked:bg-surface data-checked:text-t1 data-checked:shadow-sm forced-colors:data-checked:border-2",
            sizes[size].segment,
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
