// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { CSPProvider } from "@base-ui/react/csp-provider";
import { Field } from "@base-ui/react/field";
import { Select as BaseSelect } from "@base-ui/react/select";
import { type ReactNode, useId, useState } from "react";

import { Icon } from "../icons/Icon";
import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useOverlayOpen } from "../shortcuts/useShortcuts";
import {
  cx,
  dimmed,
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
  floating,
  iconInForcedColours,
  layers,
  listItem,
} from "./classes";
import { NestedPopups, usePopupPlacement } from "./popups";

/** One of the options of a select. */
export interface SelectOption<Value extends string> {
  /** What choosing the option reports. */
  readonly value: Value;
  /** What the option says, in the list and in the field. */
  readonly label: string;
  /**
   * An option that is listed and cannot be chosen. The arrow keys still
   * stop on it, as Base UI has it, so that it is found and said to be
   * disabled; typing passes it by.
   */
  readonly disabled?: boolean;
}

/** The props of a select. */
export interface SelectProps<Value extends string> {
  /** The name of the field. It is always there, shown or not. */
  label: string;
  /** Leaves the label to assistive technology, where a heading says it. */
  labelHidden?: boolean;
  /** A line below the field that says what it is for. */
  description?: ReactNode;
  /** What is wrong with the choice. Marks the field invalid and shows. */
  error?: string;
  /** The options, in the order of the list. */
  options: readonly SelectOption<Value>[];
  /** The chosen option, or null while nothing is chosen. */
  value: Value | null;
  /** Called with the value of the option the user chose. */
  onValueChange: (value: Value) => void;
  /** What the field says while nothing is chosen. */
  placeholder?: string;
  /** 32 px high unless said otherwise. */
  size?: FieldSize;
  /** "surface" for a field on the page itself; elevated otherwise. */
  fill?: FieldFill;
  /** Whether the choice cannot be changed at the moment. */
  disabled?: boolean;
  /** The name the value is submitted under in a form. */
  name?: string;
  /** Classes for the layout of the whole field, never for its look. */
  className?: string;
}

/**
 * A field that offers one choice from a list, with its label and the two
 * lines below it, as a text field has them. It is Base UI's select and not
 * the native element the handoff draws: its list looks the same in every
 * browser and has the tokens of both themes.
 *
 * It follows WAI-ARIA's pattern of a combobox that only selects. The field
 * is a combobox that says whether its list is open; Enter, Space and the
 * arrow keys open the list; inside it the arrow keys, Home, End and typing
 * move, Enter and Space choose, and Escape closes it and changes nothing.
 * The focus is on the options while the list is open and back on the field
 * when it closes.
 *
 * The list opens below the field and is not laid over it with the chosen
 * option on the field's own text, as Base UI would have it. That look
 * needs a list without a scrollbar, for which Base UI's list adds a style
 * element to the page whether the look is used or not, and the server's
 * Content-Security-Policy refuses one. The select tells Base UI to leave
 * the element out, itself, so that it is safe wherever it is rendered
 * (doc/adr/0026-ui-primitives-on-base-ui.md).
 *
 * A press on the label moves the focus to the field, as with a native
 * select, and does not open the list.
 *
 * While the list is open the shortcuts of the page rest, as behind a
 * dialog (doc/ui.md, "Behind a dialog").
 */
export function Select<Value extends string>({
  label,
  labelHidden = false,
  description,
  error,
  options,
  value,
  onValueChange,
  placeholder,
  size = "md",
  fill = "elevated",
  disabled = false,
  name,
  className,
}: SelectProps<Value>) {
  const [open, setOpen] = useState(false);
  useOverlayOpen(open);
  const placement = usePopupPlacement();
  // The label names the field, which Base UI sees to, and the list, which
  // it leaves without a name.
  const labelId = useId();
  // An empty text is no reason, and a field has to give one.
  const message = error === "" ? undefined : error;

  return (
    <Field.Root
      invalid={message !== undefined}
      // Positioned, to hold a label that is left to assistive technology
      // (Input.tsx says why).
      className={cx("relative flex min-w-0 flex-col gap-1.25", className)}
    >
      {/*
        No label element: a press on one is a press on the control it
        belongs to, which for this button would open the list.
      */}
      <Field.Label
        id={labelId}
        nativeLabel={false}
        render={<div />}
        className={labelHidden ? "sr-only" : fieldLabel}
      >
        {label}
      </Field.Label>
      <CSPProvider disableStyleElements>
        <BaseSelect.Root<Value>
          items={options}
          value={value}
          onValueChange={(next) => {
            if (next !== null) {
              onValueChange(next);
            }
          }}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
          }}
          disabled={disabled}
          {...(name === undefined ? {} : { name })}
        >
          <BaseSelect.Trigger
            onKeyDown={(event) => {
              // A character typed on the closed field chooses the option
              // that starts with it, as on a native select, and Base UI
              // lets the key go on to the page, where it would run a
              // shortcut as well. Prevented, it is the field's alone: the
              // registry leaves such a key be.
              if (
                event.key.length === 1 &&
                event.key !== " " &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                event.preventDefault();
              }
            }}
            className={cx(
              "flex w-full min-w-0 cursor-pointer items-center gap-2 text-t1 select-none",
              fieldBoundary,
              fieldFills[fill],
              fieldSizes[size],
              fieldInvalid,
              dimmed,
            )}
          >
            <BaseSelect.Value
              placeholder={placeholder}
              className="min-w-0 flex-1 truncate text-left data-placeholder:text-t2"
            />
            <BaseSelect.Icon>
              <Icon
                name="chevronDown"
                className={cx("size-3.5 stroke-2 text-t3", iconInForcedColours)}
              />
            </BaseSelect.Icon>
          </BaseSelect.Trigger>
          <BaseSelect.Portal {...placement.portal}>
            <BaseSelect.Positioner
              {...placement.positioner}
              alignItemWithTrigger={false}
              side="bottom"
              align="start"
              sideOffset={4}
              className={layers.popup}
            >
              <BaseSelect.Popup
                aria-labelledby={labelId}
                className={cx(
                  floating,
                  "max-h-(--available-height) min-w-(--anchor-width) overflow-auto rounded-md p-1 -outline-offset-2",
                )}
              >
                <NestedPopups>
                  <ShortcutScope scope="overlay">
                    {options.map((option) => (
                      <BaseSelect.Item
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled === true}
                        className={listItem}
                      >
                        {/*
                          The tick has its place whether it shows or not,
                          so that the labels of the list line up.
                        */}
                        <span className="flex size-3.5 shrink-0 items-center">
                          <BaseSelect.ItemIndicator>
                            <Icon
                              name="check"
                              className={cx(
                                "size-3.5 stroke-2 text-ac-t",
                                iconInForcedColours,
                              )}
                            />
                          </BaseSelect.ItemIndicator>
                        </span>
                        <BaseSelect.ItemText>
                          {option.label}
                        </BaseSelect.ItemText>
                      </BaseSelect.Item>
                    ))}
                  </ShortcutScope>
                </NestedPopups>
              </BaseSelect.Popup>
            </BaseSelect.Positioner>
          </BaseSelect.Portal>
        </BaseSelect.Root>
      </CSPProvider>
      {description !== undefined && (
        <Field.Description className={fieldDescription}>
          {description}
        </Field.Description>
      )}
      <div role="status" className={fieldErrorPlace}>
        {message !== undefined && (
          <Field.Error match className={fieldError}>
            {message}
          </Field.Error>
        )}
      </div>
    </Field.Root>
  );
}
