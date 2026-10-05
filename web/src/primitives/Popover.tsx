// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Popover as BasePopover } from "@base-ui/react/popover";
import { type ReactElement, type ReactNode, useState } from "react";

import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useOverlayOpen } from "../shortcuts/useShortcuts";
import { cx, floating, layers } from "./classes";
import { NestedPopups, usePopupPlacement } from "./popups";

/** The side of its trigger a popover opens on. */
export type PopoverSide = "top" | "right" | "bottom" | "left";

/** How a popover is lined up along the side of its trigger. */
export type PopoverAlign = "start" | "center" | "end";

/** The props of a popover. */
export interface PopoverProps {
  /**
   * The control that opens the popover, a Button or an IconButton. It is
   * told that it has a popup and whether the popup is open.
   */
  trigger: ReactElement;
  /** The name of the popover, shown as its heading. */
  title: string;
  /** Keeps the title for assistive technology alone. */
  titleHidden?: boolean;
  /** A line below the title, read with the name when the popover opens. */
  description?: string;
  side?: PopoverSide;
  align?: PopoverAlign;
  /**
   * Whether the popover shows, for a caller that has to know or to decide.
   * Without it the popover keeps that to itself.
   */
  open?: boolean;
  /** Called when the popover opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** The width, such as `w-105`. */
  className?: string;
  children: ReactNode;
}

/**
 * A panel that opens beside the control that was pressed and holds more
 * than a menu can: text, a small form, a list with a button. It is a
 * dialog that is not modal. The focus goes into it, the Tab key runs
 * through it and on into the page, which closes it, and Escape or a press
 * outside close it too.
 *
 * It opens on a press and not under the pointer. While it is open the
 * shortcuts of the page rest, as behind a dialog: the focus is on a
 * control inside it, and a letter typed there would otherwise switch the
 * theme (doc/adr/0026-ui-primitives-on-base-ui.md).
 */
export function Popover({
  trigger,
  title,
  titleHidden = false,
  description,
  side = "bottom",
  align = "start",
  open,
  onOpenChange,
  className,
  children,
}: PopoverProps) {
  const placement = usePopupPlacement();
  const [ownOpen, setOwnOpen] = useState(false);
  const shown = open ?? ownOpen;
  useOverlayOpen(shown);

  return (
    <BasePopover.Root
      open={shown}
      onOpenChange={(next) => {
        setOwnOpen(next);
        onOpenChange?.(next);
      }}
    >
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal {...placement.portal}>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          {...placement.positioner}
          className={layers.popup}
        >
          <BasePopover.Popup
            // No higher and no wider than the window leaves room for, and
            // scrolling inside that. The ring of a popover that has the
            // focus itself is drawn inside its edge.
            className={cx(
              floating,
              "flex max-h-(--available-height) max-w-[calc(100vw-1rem)] flex-col overflow-auto rounded-lg -outline-offset-2",
              className,
            )}
          >
            <ShortcutScope scope="overlay">
              <NestedPopups>
                {titleHidden && description === undefined ? (
                  <BasePopover.Title className="sr-only">
                    {title}
                  </BasePopover.Title>
                ) : (
                  <div className="flex shrink-0 flex-col gap-0.5 px-3.5 py-3">
                    <BasePopover.Title
                      className={
                        titleHidden
                          ? "sr-only"
                          : "text-[0.8125rem] font-semibold"
                      }
                    >
                      {title}
                    </BasePopover.Title>
                    {description !== undefined && (
                      <BasePopover.Description className="text-xs leading-normal text-t2">
                        {description}
                      </BasePopover.Description>
                    )}
                  </div>
                )}
                {children}
              </NestedPopups>
            </ShortcutScope>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** A button that closes the popover it is in. */
export const PopoverClose = BasePopover.Close;
