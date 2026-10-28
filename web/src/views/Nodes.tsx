// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";

import { client } from "../client/client";
import { DataAge } from "../cluster/DataAge";
import { generationOf, usePulse } from "../cluster/useCluster";
import { useFollow } from "../cluster/useFollow";
import { PageHeader } from "../layout/PageHeader";
import { type SearchChange, setTo } from "../routing/searchParams";
import {
  useSearchChanges,
  useSearchParam,
  useTypedText,
} from "../routing/useSearchParam";
import { viewOf } from "../routing/views";
import { Button } from "../primitives/Button";
import { Card } from "../primitives/Card";
import { CellGrid } from "../primitives/CellGrid";
import { Chip } from "../primitives/Chip";
import { EmptyState } from "../primitives/EmptyState";
import { Input } from "../primitives/Input";
import { Select } from "../primitives/Select";
import { Stale, Unready } from "./Fetching";
import {
  cellOf,
  countStates,
  nodeStates,
  partitionsOf,
  passes,
  wordOf,
} from "./nodes/nodes";
import {
  clearFilters,
  partitionParam,
  statesParam,
  textParam,
} from "./nodes/params";
import { WithCluster } from "./WithCluster";

/**
 * The Nodes view: every node of the cluster as a cell of a map, in the
 * colour of its state (doc/adr/0036-the-cluster-views-on-real-data.md).
 */
export function Nodes() {
  const { title, summary } = viewOf("nodes");

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={title} summary={summary} />
      <WithCluster>{(cluster) => <NodesOf cluster={cluster} />}</WithCluster>
    </div>
  );
}

/**
 * The nodes of one cluster: the filters and the map. sdash sends every
 * node, and the view filters them itself: a cluster has thousands of
 * nodes at most, and a map is of all of them.
 */
function NodesOf({ cluster }: { cluster: string }) {
  const [text] = useSearchParam(textParam);
  const [states] = useSearchParam(statesParam);
  const [partition] = useSearchParam(partitionParam);
  const changeSearch = useSearchChanges();

  const pulse = usePulse(cluster, viewOf("nodes").kinds);
  const nodes = useQuery({
    queryKey: ["nodes", cluster],
    queryFn: ({ signal }) => client.getNodes(cluster, { signal }),
  });
  useFollow(nodes, generationOf(pulse.data, "nodes"));

  function filter(...changes: readonly SearchChange[]) {
    changeSearch(changes);
  }
  const [typed, type] = useTypedText(text, (value) => {
    filter(setTo(textParam, value));
  });

  const list = nodes.data;
  const all = list?.rows ?? [];
  const shown = all.filter((node) => passes(node, { text, states, partition }));
  const counts = countStates(all);
  const filtered = text !== "" || states.length > 0 || partition !== "";
  // The states of the legend, and any other a node is in or the address
  // names, so that a filter can always be taken off.
  const chips = [
    ...nodeStates.map((each) => each.state),
    ...[...counts.keys(), ...states]
      .filter(
        (state, index, every) =>
          !nodeStates.some((each) => each.state === state) &&
          every.indexOf(state) === index,
      )
      .sort(),
  ];
  const partitions = [
    ...new Set([
      ...partitionsOf(all),
      ...(partition === "" ? [] : [partition]),
    ]),
  ].sort();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          label="Find nodes"
          labelHidden
          placeholder="Find nodes by name"
          leading="search"
          fill="surface"
          value={typed}
          onValueChange={type}
          className="w-full max-w-64"
        />
        <div
          role="group"
          aria-label="States"
          className="flex flex-wrap items-center gap-1"
        >
          <Chip
            size="sm"
            pressed={states.length === 0}
            onPressedChange={() => {
              filter(setTo(statesParam, []));
            }}
          >
            All
          </Chip>
          {chips.map((state) => (
            <Chip
              key={state}
              size="sm"
              count={counts.get(state) ?? 0}
              pressed={states.includes(state)}
              onPressedChange={(pressed) => {
                filter(
                  setTo(
                    statesParam,
                    pressed
                      ? chips.filter(
                          (chip) => chip === state || states.includes(chip),
                        )
                      : states.filter((other) => other !== state),
                  ),
                );
              }}
            >
              {wordOf(state)}
            </Chip>
          ))}
        </div>
        <Select
          label="Partition"
          labelHidden
          size="sm"
          fill="surface"
          options={[
            { value: "", label: "All partitions" },
            ...partitions.map((name) => ({ value: name, label: name })),
          ]}
          value={partition}
          onValueChange={(value) => {
            filter(setTo(partitionParam, value));
          }}
        />
        <p role="status" className="ml-auto text-xs text-t2">
          {list !== undefined && (
            <>
              {filtered
                ? `${String(shown.length)} of ${String(all.length)} nodes`
                : all.length === 1
                  ? "1 node"
                  : `${String(all.length)} nodes`}
              {", "}
              <DataAge fetchedAt={list.fetchedAt} />
            </>
          )}
        </p>
      </div>
      <Stale error={list?.error} what="The nodes shown" />
      <Card title={`Nodes of ${cluster}`} level={2}>
        {list === undefined ? (
          <Unready
            error={nodes.error}
            what="the nodes"
            level={3}
            onRetry={() => {
              void nodes.refetch();
            }}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title={filtered ? "No nodes match these filters" : "No nodes"}
            level={3}
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    filter(...clearFilters);
                  }}
                >
                  Clear the filters
                </Button>
              ) : undefined
            }
          >
            {filtered
              ? "No node of the cluster passes all of these filters."
              : `slurmctld knows of no node on ${cluster}.`}
          </EmptyState>
        ) : (
          <CellGrid
            label={`Nodes of ${cluster}`}
            cells={shown.map((node) => cellOf(node))}
            tones={nodeStates.map(({ tone, label }) => ({ tone, label }))}
          />
        )}
      </Card>
    </>
  );
}
