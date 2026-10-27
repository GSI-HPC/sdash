// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Icon } from "../icons/Icon";
import { Tooltip } from "../primitives/Tooltip";

/**
 * The button that will switch between clusters. There is none to switch
 * to yet, so it has nothing to open
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 *
 * It is marked as disabled with aria-disabled and not with the disabled
 * attribute, which would take it out of the order of the Tab key: a
 * keyboard user could then not reach it to learn why it does nothing. The
 * reason is its description, read by a screen reader with the button and
 * shown as a tooltip on hover and on focus. The reason is a sentence, far
 * wider than the button, so it starts at the button's left edge, where a
 * reader looks for the start of a line, and is not centred below it.
 */
export function ClusterSwitcher() {
  return (
    <Tooltip
      kind="description"
      label="No cluster is configured yet, so there is none to switch to."
      side="bottom"
      align="start"
    >
      <button
        type="button"
        aria-disabled="true"
        className="flex h-8 shrink-0 cursor-default items-center gap-2 rounded-md border border-bd bg-surface px-2.5 text-[0.78125rem] text-t3"
      >
        <span aria-hidden="true" className="size-1.75 rounded-full bg-(--t4)" />
        <span className="font-semibold max-sm:sr-only">Clusters</span>
        <Icon name="chevronDown" className="size-3 stroke-2" />
      </button>
    </Tooltip>
  );
}
