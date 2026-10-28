// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useLocation, useNavigate } from "react-router";

import type { HealthTone } from "../cluster/health";
import { clusterParam } from "../cluster/useCluster";
import type { ClusterHealth } from "../cluster/useHealth";
import { Icon } from "../icons/Icon";
import { Menu, MenuRadioGroup, MenuRadioItem } from "../primitives/Menu";
import { Tooltip } from "../primitives/Tooltip";

// The light of the switcher repeats the tone of the status pill beside it.
const lights = {
  neutral: "bg-(--t4)",
  ok: "bg-ok-fg",
  warn: "bg-warn-fg",
  err: "bg-err-fg",
} as const satisfies Record<HealthTone, string>;

const shape =
  "flex h-8 shrink-0 items-center gap-2 rounded-md border border-bd bg-surface px-2.5 text-[0.78125rem]";

/**
 * The button that switches between the clusters of the profile file: a
 * light in the tone of the status pill, the name of the cluster the page
 * shows and its Slurm release. It opens a menu of the clusters, and the
 * one chosen is named in the address, which keeps the view and leaves its
 * filters behind (doc/adr/0036-the-cluster-views-on-real-data.md). Below
 * 640 px the name and the release are left to assistive technology.
 *
 * Without a cluster to switch to it is marked as disabled with
 * aria-disabled and not with the disabled attribute, which would take it
 * out of the order of the Tab key: a keyboard user could then not reach
 * it to learn why it does nothing. The reason is its description, read by
 * a screen reader with the button and shown as a tooltip on hover and on
 * focus. The reason is a sentence, far wider than the button, so it starts
 * at the button's left edge, where a reader looks for the start of a line,
 * and is not centred below it.
 */
export function ClusterSwitcher({ choice, health, pulse }: ClusterHealth) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (choice.kind !== "chosen" && choice.kind !== "unknown") {
    const reason =
      choice.kind === "none"
        ? "No cluster is configured yet, so there is none to switch to."
        : health.text;
    return (
      <Tooltip kind="description" label={reason} side="bottom" align="start">
        <button
          type="button"
          aria-disabled="true"
          className={`${shape} cursor-default text-t3`}
        >
          <span
            aria-hidden="true"
            className={`size-1.75 rounded-full ${lights.neutral}`}
          />
          <span className="font-semibold max-sm:sr-only">Clusters</span>
          <Icon name="chevronDown" className="size-3 stroke-2" />
        </button>
      </Tooltip>
    );
  }

  const release = pulse?.connection.release;
  return (
    <Menu
      trigger={
        <button
          type="button"
          className={`${shape} cursor-pointer text-t1 hover:bg-hover`}
        >
          <span
            aria-hidden="true"
            className={`size-1.75 rounded-full ${lights[health.tone]}`}
          />
          <span className="max-sm:sr-only">
            <span className="sr-only">Cluster </span>
            <span className="font-semibold">{choice.name}</span>
            {release !== undefined && (
              <>
                {" "}
                <span className="ml-1 font-mono text-[0.6875rem] text-t2">
                  {release}
                </span>
              </>
            )}
          </span>
          <Icon name="chevronDown" className="size-3 stroke-2 text-t3" />
        </button>
      }
      className="w-75"
    >
      <MenuRadioGroup
        label="Clusters"
        value={choice.name}
        onValueChange={(name: string) => {
          if (name !== choice.name) {
            const search = new URLSearchParams({ [clusterParam.name]: name });
            void navigate(`${pathname}?${search.toString()}`);
          }
        }}
      >
        {choice.known.map((name) => (
          <MenuRadioItem key={name} value={name}>
            {name}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </Menu>
  );
}
