// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Field } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";

import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/paths";
import {
  cx,
  fieldBoundary,
  fieldDescription,
  fieldError,
  fieldErrorPlace,
  type FieldFill,
  fieldFills,
  fieldInvalid,
  fieldLabel,
  type FieldSize,
  fieldSizes,
  iconInForcedColours,
} from "./classes";

// A field with an icon is the field alone, with room at its start that the
// icon is laid over. The field then carries its boundary, its ring and its
// states as any other, and a press on the icon is a press on the field.
// The sizes are those of classes.ts with that room in place of the padding
// at the start: the padding, the icon and the gap after it.
const withIcon = {
  sm: {
    control: "h-7 rounded-[5px] pr-2 pl-7.5 text-xs",
    icon: "left-2",
  },
  md: {
    control: "h-8 rounded-[5px] pr-2.5 pl-8 text-[0.78125rem]",
    icon: "left-2.5",
  },
} as const;

/**
 * The props of a text field: its label and what stands below it, its look,
 * and whatever Base UI's field control and the native input take, `value`,
 * `onValueChange`, `placeholder`, `readOnly` and `disabled` among them.
 * The native `size` attribute gives way to the size of the control.
 */
export type InputProps = Omit<
  ComponentProps<typeof Field.Control>,
  "className" | "style" | "render" | "size"
> & {
  /** The name of the field. It is always there, shown or not. */
  label: string;
  /** Leaves the label to assistive technology, where a heading says it. */
  labelHidden?: boolean;
  /** A line below the field that says what it is for. */
  description?: ReactNode;
  /** What is wrong with the value. Marks the field invalid and shows. */
  error?: string;
  /** 32 px high unless said otherwise. */
  size?: FieldSize;
  /** "surface" for a field on the page itself; elevated otherwise. */
  fill?: FieldFill;
  /** In DM Mono, for an id, a path or a number. */
  mono?: boolean;
  /** An icon inside the field, before the text. */
  leading?: IconName;
  /** Classes for the layout of the whole field, never for its look. */
  className?: string;
};

/**
 * A text field with its label, and below it a line that says what it is
 * for and a line that says what is wrong. Base UI's field ties the three
 * to the input: the label names it, both lines describe it, and an error
 * marks it invalid (WCAG 2.1, success criteria 1.3.1, 3.3.1 and 3.3.2).
 *
 * The error is the caller's to give, as text. Where the caller gives none
 * and the browser finds the value wrong, by `required` or `type`, the
 * field says so in the browser's words once Enter was pressed in it. The
 * field itself is marked invalid with a text that says why and never
 * without; what the browser tells assistive technology of a value it finds
 * wrong before that is the browser's own. The text appears in a place that
 * announces it, so that it is heard when it comes and not only on the next
 * visit to the field.
 *
 * The boundary is what an empty field is known by, so it is --t3 and not
 * the handoff's --bd, and the placeholder is text, so it is --t2
 * (doc/ui.md lists the departures). A field that is read-only has the
 * background of the page, and a lock beside its label, as in the handoff.
 * The selector for it is the attribute: `:read-only` is true of a disabled
 * field as well, which is the same field, dimmed.
 *
 * The registry of shortcuts leaves the keys typed into a field alone.
 */
export function Input({
  label,
  labelHidden = false,
  description,
  error,
  size = "md",
  fill = "elevated",
  mono = false,
  leading,
  className,
  ...rest
}: InputProps) {
  // An empty text is no reason, and a field has to give one.
  const message = error === "" ? undefined : error;

  const control = (
    <Field.Control
      {...rest}
      className={cx(
        "peer w-full min-w-0 text-t1 placeholder:text-t2 disabled:cursor-not-allowed disabled:opacity-45 [&[readonly]]:bg-base [&[readonly]]:text-t2",
        fieldBoundary,
        fieldFills[fill],
        leading ? withIcon[size].control : fieldSizes[size],
        fieldInvalid,
        mono && "font-mono",
      )}
    />
  );

  return (
    <Field.Root
      invalid={message !== undefined}
      // Positioned, to hold a label that is left to assistive technology:
      // such a label is taken out of the flow, and without a positioned
      // element around it the page itself would hold it, where the region
      // the field scrolls in ends, and grow by it.
      className={cx("relative flex min-w-0 flex-col gap-1.25", className)}
    >
      <Field.Label className={labelHidden ? "sr-only" : fieldLabel}>
        {label}
        {rest.readOnly && (
          <Icon
            name="lock"
            className={cx("size-3 stroke-2 text-t3", iconInForcedColours)}
          />
        )}
      </Field.Label>
      {leading ? (
        <div className="relative">
          {control}
          <Icon
            name={leading}
            className={cx(
              "pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 stroke-2 text-t3 peer-disabled:opacity-45",
              iconInForcedColours,
              withIcon[size].icon,
            )}
          />
        </div>
      ) : (
        control
      )}
      {description !== undefined && (
        <Field.Description className={fieldDescription}>
          {description}
        </Field.Description>
      )}
      <div role="status" className={fieldErrorPlace}>
        {message === undefined ? (
          <Field.Error className={fieldError} />
        ) : (
          <Field.Error match className={fieldError}>
            {message}
          </Field.Error>
        )}
      </div>
    </Field.Root>
  );
}
