// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Menu as BaseMenu } from "@base-ui/react/menu";
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";

import { Icon } from "../icons/Icon";
import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useOverlayOpen } from "../shortcuts/useShortcuts";
import {
  cx,
  floating,
  iconInForcedColours,
  layers,
  listDetail,
  listItem,
  listLabel,
  listSeparator,
} from "./classes";
import { NestedPopups, usePopupPlacement } from "./popups";

// A menu of actions that opens from a button, on Base UI's menu: the
// entries take the real focus, the arrow keys, Home and End move it, a
// letter jumps to the entry that starts with it, Enter and Space choose,
// and Escape or a press outside close the menu and give the focus back to
// the button.
//
// An entry that is marked has the focus, and the hover background and the
// ring show where that is. The handoff gives the chosen entry of a choice
// the same background, which would then say two things: here the tick
// alone says which entry is chosen (doc/ui.md lists the departures).

/** The side of its trigger a menu opens on. */
export type MenuSide = "top" | "right" | "bottom" | "left";

/** How a menu is lined up along the side of its trigger. */
export type MenuAlign = "start" | "center" | "end";

/** The props of a menu. */
export interface MenuProps {
  /**
   * The button that opens the menu, a Button or an IconButton. Its name
   * is the name of the menu.
   */
  trigger: ReactElement;
  side?: MenuSide;
  align?: MenuAlign;
  /** The width, where the widest entry is not to decide it. */
  className?: string;
  /** MenuItem, MenuGroup, MenuRadioGroup and MenuSeparator. */
  children: ReactNode;
}

/**
 * A list of actions behind a button. It is modal: while it is open the
 * rest of the page does not answer the pointer, and a press outside only
 * closes it. The shortcuts of the page rest for as long, as behind a
 * dialog (doc/adr/0026-ui-primitives-on-base-ui.md).
 */
export function Menu({
  trigger,
  side = "bottom",
  align = "start",
  className,
  children,
}: MenuProps) {
  const placement = usePopupPlacement();
  const [open, setOpen] = useState(false);
  useOverlayOpen(open);

  return (
    <BaseMenu.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal {...placement.portal}>
        <BaseMenu.Positioner
          side={side}
          align={align}
          sideOffset={4}
          {...placement.positioner}
          className={layers.popup}
        >
          <BaseMenu.Popup
            className={cx(
              floating,
              "max-h-(--available-height) max-w-[calc(100vw-1rem)] min-w-44 overflow-auto rounded-md p-1 -outline-offset-2",
              className,
            )}
          >
            <ShortcutScope scope="overlay">
              <NestedPopups>{children}</NestedPopups>
            </ShortcutScope>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

/** What an entry is about: an action like any other, or one that destroys. */
export type MenuItemTone = "default" | "danger";

/**
 * The props of an entry: what Base UI's menu item takes, among them
 * `onClick`, which is what choosing the entry runs, and `disabled`.
 */
export type MenuItemProps = Omit<
  ComponentProps<typeof BaseMenu.Item>,
  "className" | "style" | "render" | "children"
> & {
  /** "danger" for an action that deletes or cancels something. */
  tone?: MenuItemTone;
  /** A short text at the end of the entry, a key or a value. */
  detail?: string;
  /** The text of the entry, which is its name. */
  children: ReactNode;
};

/**
 * An entry of a menu: one action. Choosing it, by Enter, Space or a
 * press, runs its `onClick` and closes the menu.
 *
 * An entry that is `disabled` stays in reach of the arrow keys, as Base UI
 * has it and the WAI-ARIA practices recommend for a menu: it says that it
 * is disabled, and choosing it does nothing. A user of a screen reader
 * then learns that the action exists.
 */
export function MenuItem({
  tone = "default",
  detail,
  children,
  ...rest
}: MenuItemProps) {
  return (
    <BaseMenu.Item {...rest} className={listItem}>
      {/*
        The colour of a destructive entry is on its text and not on the
        entry, whose classes set one already: of two utilities for one
        property the stylesheet decides which holds.
      */}
      <span className={tone === "danger" ? "text-err-fg" : undefined}>
        {children}
      </span>
      {detail !== undefined && <span className={listDetail}>{detail}</span>}
    </BaseMenu.Item>
  );
}

/**
 * Entries that belong together, under a heading that names them to
 * assistive technology as well. A heading is always the heading of a
 * group: one that stood alone between entries could not say which of them
 * it is about.
 */
export function MenuGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <BaseMenu.Group>
      <BaseMenu.GroupLabel className={listLabel}>{label}</BaseMenu.GroupLabel>
      {children}
    </BaseMenu.Group>
  );
}

/** The props of a choice inside a menu. */
export interface MenuRadioGroupProps<Value extends string> {
  /** The heading of the choice, and its name. */
  label: string;
  /** The value of the entry that is chosen. */
  value: Value;
  /** Called when the user chooses another entry. */
  onValueChange: (value: Value) => void;
  /** The entries, each a MenuRadioItem. */
  children: ReactNode;
}

/**
 * A choice of one among several inside a menu: the entries are radio
 * items, and the one that is chosen says so and shows a tick.
 */
export function MenuRadioGroup<Value extends string>({
  label,
  value,
  onValueChange,
  children,
}: MenuRadioGroupProps<Value>) {
  return (
    <BaseMenu.RadioGroup
      value={value}
      onValueChange={(next: Value) => {
        onValueChange(next);
      }}
    >
      <BaseMenu.GroupLabel className={listLabel}>{label}</BaseMenu.GroupLabel>
      {children}
    </BaseMenu.RadioGroup>
  );
}

/** The props of one entry of a choice. */
export interface MenuRadioItemProps {
  /** What the choice becomes when this entry is chosen. */
  value: string;
  /** A short text at the end of the entry. */
  detail?: string;
  disabled?: boolean;
  /** The text of the entry, which is its name. */
  children: ReactNode;
}

/**
 * One entry of a MenuRadioGroup. Choosing it closes the menu, as choosing
 * any entry does; Base UI would leave the menu open.
 */
export function MenuRadioItem({
  value,
  detail,
  disabled = false,
  children,
}: MenuRadioItemProps) {
  return (
    <BaseMenu.RadioItem
      value={value}
      disabled={disabled}
      closeOnClick
      className={listItem}
    >
      <span>{children}</span>
      {detail !== undefined && <span className={listDetail}>{detail}</span>}
      {/*
        The place of the tick is there whether the entry is chosen or not,
        so that the texts at the end of the entries stand in one column.
      */}
      <span
        className={cx(
          "grid size-3.5 shrink-0 place-items-center",
          detail === undefined && "ml-auto",
        )}
      >
        <BaseMenu.RadioItemIndicator>
          <Icon
            name="check"
            className={cx("size-3.5 stroke-2 text-ac-t", iconInForcedColours)}
          />
        </BaseMenu.RadioItemIndicator>
      </span>
    </BaseMenu.RadioItem>
  );
}

/** A line between groups of entries. */
export function MenuSeparator() {
  return <BaseMenu.Separator className={listSeparator} />;
}
