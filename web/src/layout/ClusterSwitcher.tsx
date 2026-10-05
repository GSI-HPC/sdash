// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useId } from "react";

import { Icon } from "../icons/Icon";
import { Hint, useHint } from "./Hint";

/**
 * The button that will switch between clusters. There is none to switch
 * to yet, so it has nothing to open
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 *
 * It is marked as disabled with aria-disabled and not with the disabled
 * attribute, which would take it out of the order of the Tab key: a
 * keyboard user could then not reach it to learn why it does nothing. The
 * reason is its description, read by a screen reader with the button and
 * shown as a hint on hover and on focus.
 */
export function ClusterSwitcher() {
  const hint = useHint("below");
  const reasonId = useId();

  return (
    <span className="shrink-0" {...hint.owner}>
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={reasonId}
        className="flex h-8 cursor-default items-center gap-2 rounded-md border border-bd bg-surface px-2.5 text-[0.78125rem] text-t3"
      >
        <span aria-hidden="true" className="size-1.75 rounded-full bg-(--t4)" />
        <span className="font-semibold max-sm:sr-only">Clusters</span>
        <Icon name="chevronDown" className="size-3 stroke-2" />
      </button>
      <Hint state={hint} id={reasonId}>
        No cluster is configured yet, so there is none to switch to.
      </Hint>
    </span>
  );
}
