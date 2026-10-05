// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import {
  cloneElement,
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Keys } from "../shortcuts/Keys";
import { cx, floating, layers } from "./classes";
import { usePopupPlacement } from "./popups";

// A tooltip is a short text that shows beside a control while the pointer
// rests on it or the keyboard focus is on it: the name of a control that
// shows an icon alone, the reason a control cannot be used. It is never the
// native title attribute, which a keyboard cannot reach and a browser shows
// when it likes.
//
// Base UI's tooltip brings what WCAG 2.1 asks of content that appears on
// hover or focus (success criterion 1.4.13): the pointer can move onto the
// tooltip without losing it, it stays for as long as the pointer or the
// focus does, and Escape puts it away. It also keeps the tooltip beside its
// control when the control moves, and inside the window. What Base UI
// leaves open is what a tooltip is to assistive technology, which the two
// kinds below decide, whose Escape is when a tooltip shows inside a
// dialog, and what becomes of a tooltip the keyboard brought up when the
// pointer goes somewhere else (doc/adr/0026-ui-primitives-on-base-ui.md).

/**
 * What a tooltip is to its control. A `label` repeats the name the control
 * already has, and assistive technology skips it. A `description` says
 * something the name does not, and is read with the control whether the
 * tooltip shows or not.
 */
export type TooltipKind = "label" | "description";

/** The side of its control a tooltip shows on. */
export type TooltipSide = "top" | "right" | "bottom" | "left";

/** How a tooltip is lined up along the side of its control. */
export type TooltipAlign = "start" | "center" | "end";

/** How long the pointer rests on a control before its tooltip shows. */
const delay = 300;

/** The props of a tooltip. */
export interface TooltipProps {
  /** What the tooltip says. */
  label: string;
  /**
   * A shortcut that does what the control does, drawn as key caps beside
   * the label. Nothing is drawn while the shortcut is switched off.
   */
  keys?: string;
  /** Whether the tooltip names its control or describes it. */
  kind?: TooltipKind;
  side?: TooltipSide;
  align?: TooltipAlign;
  /**
   * The control shows no tooltip at the moment, as an item of the sidebar
   * does not while its name stands beside it. Nothing shows, nothing is
   * remembered for when it is enabled again, and a description is not
   * read.
   */
  disabled?: boolean;
  /**
   * The one control the tooltip belongs to. It has to pass the props and
   * the ref it is given on to its element, as a native element and every
   * primitive do. A control with the native disabled attribute gets no
   * events and so no tooltip: one that explains itself stays focusable.
   */
  children: ReactElement<{ "aria-describedby"?: string | undefined }>;
}

/**
 * Shows a text beside the control it is wrapped around, after a moment
 * under the pointer and at once on keyboard focus, which is the focus the
 * browser draws a ring for: a click does not bring it up.
 *
 * A tooltip of the kind `label` has to say what the control is called, so
 * that someone who speaks to the computer can say what they see (WCAG 2.1,
 * success criterion 2.5.3). The control keeps its own name, as text or as
 * an aria-label; the tooltip adds nothing to it.
 */
export function Tooltip({
  label,
  keys,
  kind = "label",
  side = "bottom",
  align = "center",
  disabled = false,
  children,
}: TooltipProps) {
  const placement = usePopupPlacement();
  const id = useId();
  const describes = kind === "description" && !disabled;

  // Escape belongs to the tooltip for as long as it shows: the first press
  // puts the tooltip away and nothing else, the next one closes the dialog
  // the control is in. Base UI acts on the key where it reaches the
  // control, and so misses two cases. The pointer rests on a control while
  // another has the focus: the key then reaches the dialog first, which
  // closes. And the control is a button that is disabled and still takes
  // the focus, which is the one that explains itself with a tooltip: Base
  // UI's button drops the key handlers it is handed while it is disabled.
  // So the key is taken on the document, before anything else has it.
  const [open, setOpen] = useState(false);
  const actions = useRef<BaseTooltip.Root.Actions>(null);
  const trigger = useRef<HTMLElement>(null);
  // A function and not the ref itself: Base UI's trigger asks for the ref
  // of a button, and the control may be a link.
  const setTrigger = useCallback((element: HTMLElement | null) => {
    trigger.current = element;
  }, []);
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      // Not while a character is being composed: Escape then ends the
      // composition, and is the text field's.
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }
      // A key that is taken here reaches nothing else, so it is taken for
      // a tooltip that can be seen and for no other reason. One whose
      // control was scrolled out of sight is open and hidden: it is closed
      // all the same, since Base UI would otherwise take the key for it,
      // and the key goes on to the dialog, which the user does see. Were
      // this component ever wrong about being open, Escape would still
      // close the dialogs.
      const seen = popup.current?.checkVisibility({ visibilityProperty: true });
      actions.current?.close();
      if (seen) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  // The description is written onto the control itself and not handed to
  // the trigger: Base UI lets the props of the control win over its own,
  // and a description the control already has would silently replace the
  // tooltip's.
  const control = describes
    ? cloneElement(children, {
        "aria-describedby": cx(children.props["aria-describedby"], id),
      })
    : children;

  return (
    <BaseTooltip.Root
      disabled={disabled}
      actionsRef={actions}
      onOpenChange={(next, details) => {
        // A tooltip stays for as long as what brought it up does (WCAG
        // 2.1, success criterion 1.4.13). Base UI closes one for two
        // reasons that have nothing to do with that: the pointer left the
        // control, also when the keyboard focus is still on it, and
        // another tooltip opened, since Base UI shows one at a time, also
        // without its provider. Neither closes a tooltip whose control the
        // keyboard focus is on, nor does the second close one the pointer
        // still rests on. So two can show at once: the reason a control
        // gives on focus, and the name of another under the pointer.
        const owner = trigger.current;
        const stays =
          !next &&
          owner !== null &&
          ((details.reason === "trigger-hover" &&
            owner.matches(":focus-visible")) ||
            (details.reason === "none" &&
              owner.matches(":focus-visible, :hover")));
        if (stays) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <BaseTooltip.Trigger ref={setTrigger} render={control} delay={delay} />
      {/*
        A description stays on the page while the tooltip is closed: what
        aria-describedby points to has to exist to be read.
      */}
      <BaseTooltip.Portal keepMounted={describes} {...placement.portal}>
        <BaseTooltip.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          {...placement.positioner}
          // Base UI moves the tooltip with its control. Once the control is
          // scrolled out of sight the tooltip would stand beside nothing.
          className={cx(layers.tooltip, "data-anchor-hidden:invisible")}
        >
          <BaseTooltip.Popup
            ref={popup}
            // The one hook a test has for a tooltip that names its control,
            // which has no role.
            data-slot="tooltip"
            {...(describes ? { id, role: "tooltip" } : { "aria-hidden": true })}
            // A label may be one long word, a path or an id, which has to
            // break where the tooltip ends.
            className={cx(
              floating,
              "w-max max-w-64 rounded-[5px] px-2 py-1 text-xs font-medium wrap-anywhere whitespace-normal",
            )}
          >
            <span className="flex items-center gap-2">
              {label}
              {keys !== undefined && <Keys keys={keys} size="small" />}
            </span>
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
