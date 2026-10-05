// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

import { cx, dimmedWithin } from "./classes";

// Tabs on Base UI's, after WAI-ARIA's pattern: a list of tabs of which one
// is selected, and the panel of that tab. The Tab key stops once in the
// list, on the selected tab, and next on the panel; the arrow keys move
// along the list and wrap, Home and End go to its ends. A tab is activated
// by the focus arriving on it, which the pattern recommends where a panel
// shows without delay, so a view has to make a change of tab cheap.
//
// Base UI's indicator, a line that slides from tab to tab, is not used:
// the line under the selected tab is that tab's own border
// (doc/adr/0026-ui-primitives-on-base-ui.md).

/** The props of the root of a set of tabs. */
export interface TabsProps<Value extends string> {
  /** The value of the selected tab. The caller keeps it. */
  value: Value;
  /** Called with the value of the tab the user went to. */
  onValueChange: (value: Value) => void;
  /** Classes for the layout of the element around list and panels. */
  className?: string;
  /** The list and the panels, wherever below this they are rendered. */
  children: ReactNode;
}

/**
 * Holds which tab is selected for the TabList and the TabPanels inside it.
 * It renders one element around them and gives it no layout but the
 * caller's, so that the list can stand in one part of a layout, the header
 * of a drawer, say, and the panels in another.
 */
export function Tabs<Value extends string>({
  value,
  onValueChange,
  className,
  children,
}: TabsProps<Value>) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next: Value) => {
        onValueChange(next);
      }}
      className={className}
    >
      {children}
    </BaseTabs.Root>
  );
}

/** The props of a list of tabs. */
export interface TabListProps {
  /** The name of the list: what the tabs are parts of. */
  label: string;
  /** Classes for the layout around the list, never for its look. */
  className?: string;
  /** The tabs. */
  children: ReactNode;
}

/**
 * The row of tabs, on the line that the selected one interrupts with its
 * own. The row wraps where it is too long for its place, as on a page
 * enlarged to four times its size.
 */
export function TabList({ label, className, children }: TabListProps) {
  return (
    <BaseTabs.List
      activateOnFocus
      aria-label={label}
      className={cx("flex flex-wrap gap-x-4.5 border-b border-bd", className)}
    >
      {children}
    </BaseTabs.List>
  );
}

/** The props of one tab. */
export interface TabProps {
  /** The value the tab selects, and the one its panel has. */
  value: string;
  /**
   * A tab that is listed and cannot be gone to. The arrow keys still stop
   * on it, as Base UI has it, so that it is found and said to be disabled;
   * the focus on it selects nothing. Its text is dimmed and its ring is
   * not.
   */
  disabled?: boolean;
  /** The text, which is the name of the tab. */
  children: ReactNode;
}

/**
 * One tab of a list. The selected tab has the primary text colour and a
 * line in the accent under it, and the others have no line at all: a
 * transparent one would be painted where the system forces its colours,
 * and every tab would look selected there. The space of the missing line
 * is padding, so that the text does not move when the selection does.
 *
 * The handoff sets the other tabs in --t3, which is below 4.5:1 on the
 * page in the light theme; they are --t2 (doc/ui.md lists the departures).
 */
export function Tab({ value, disabled = false, children }: TabProps) {
  return (
    <BaseTabs.Tab
      value={value}
      disabled={disabled}
      className={cx(
        "-mb-px inline-flex h-8.5 cursor-pointer items-center pb-0.5 text-[0.78125rem] font-medium whitespace-nowrap text-t2 hover:text-t1 data-active:border-b-2 data-active:border-ac data-active:pb-0 data-active:text-t1",
        dimmedWithin,
      )}
    >
      {/* An element, so that a disabled tab can dim it. */}
      <span>{children}</span>
    </BaseTabs.Tab>
  );
}

/** The props of the panel of a tab. */
export interface TabPanelProps {
  /** The value of the tab the panel belongs to. */
  value: string;
  /** Classes for the layout of the panel. */
  className?: string;
  /** What the tab shows. */
  children: ReactNode;
}

/**
 * What a tab shows. Only the panel of the selected tab is on the page. It
 * is named by its tab and is a stop of the Tab key itself, so that a panel
 * with no control in it is still reached and read. Its ring is drawn
 * inside its edge, where nothing around the panel clips it.
 */
export function TabPanel({ value, className, children }: TabPanelProps) {
  return (
    <BaseTabs.Panel
      value={value}
      className={cx("-outline-offset-2", className)}
    >
      {children}
    </BaseTabs.Panel>
  );
}
