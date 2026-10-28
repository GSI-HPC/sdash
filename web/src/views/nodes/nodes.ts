// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// What the views of nodes make of a node: the one state it shows, the tone
// of that state, and its figures in words. Nothing here renders.

import type { NodeList } from "../../client/client";
import type { GridCell } from "../../primitives/CellGrid";
import type { GraphicTone } from "../../primitives/graphics";

/** One node of a cluster. */
export type Node = NodeList["rows"][number];

/**
 * The states a node shows, each with its tone and its word, in the order
 * of the handoff's legend (doc/design/README.md, "Status mapping"). A
 * state Slurm has beyond these is neutral.
 */
export const nodeStates = [
  { state: "IDLE", tone: "ok", label: "Idle" },
  { state: "MIXED", tone: "info", label: "Mixed" },
  { state: "ALLOCATED", tone: "accent", label: "Allocated" },
  { state: "RESERVED", tone: "vio", label: "Reserved" },
  { state: "DRAIN", tone: "warn", label: "Drain" },
  { state: "DOWN", tone: "err", label: "Down" },
] as const satisfies readonly {
  state: string;
  tone: GraphicTone;
  label: string;
}[];

/**
 * The one state a node shows: DOWN where it is down, DRAIN where it is
 * drained or draining, RESERVED where it is in a reservation, and its base
 * state otherwise. slurmctld sends the first two and the last as flags of
 * a base state that says what the node does meanwhile, IDLE or MIXED; what
 * a user has to know first is that no new job starts there.
 */
export function stateOf(node: Node): string {
  if (node.state === "DOWN" || node.flags.includes("NOT_RESPONDING")) {
    return "DOWN";
  }
  if (node.flags.includes("DRAIN")) {
    return "DRAIN";
  }
  if (node.flags.includes("RESERVED")) {
    return "RESERVED";
  }
  return node.state;
}

/** The tone of a state a node shows. */
export function toneOf(state: string): GraphicTone {
  return nodeStates.find((each) => each.state === state)?.tone ?? "neutral";
}

/** A state as a word: "Idle" for IDLE, "Powered down" for POWERED_DOWN. */
export function wordOf(state: string): string {
  const known = nodeStates.find((each) => each.state === state);
  if (known !== undefined) {
    return known.label;
  }
  const words = state.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A size of memory as Slurm counts it, in megabytes of 1024 kilobytes:
 * "512 MB", "1.5 GB", "2 TB".
 */
export function memory(megabytes: number): string {
  const units = ["MB", "GB", "TB"];
  let size = megabytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const figure = Number.isInteger(size) ? String(size) : size.toFixed(1);
  return `${figure} ${units[unit] ?? ""}`;
}

/**
 * What a node holds, in words, for the tooltip and the name of its cell:
 * its CPUs, its load, its memory, and why it is drained or down.
 */
export function detailOf(node: Node): string {
  return [
    `${String(node.allocCpus)} of ${String(node.cpus)} CPUs allocated`,
    `load ${node.load.toFixed(2)}`,
    `${memory(node.allocMemory)} of ${memory(node.memory)} memory allocated`,
    ...(node.reason === undefined || node.reason === ""
      ? []
      : [`reason: ${node.reason}`]),
  ].join(", ");
}

/**
 * The cell of a node in a map of nodes. A state the legend has no word
 * for is said in the detail, since the name of a cell names the state by
 * the word of its tone.
 */
export function cellOf(node: Node): GridCell {
  const state = stateOf(node);
  const tone = toneOf(state);
  return {
    id: node.name,
    label: node.name,
    tone,
    detail:
      tone === "neutral"
        ? `${wordOf(state)}, ${detailOf(node)}`
        : detailOf(node),
  };
}

/** The partitions of the nodes, by name, each once. */
export function partitionsOf(nodes: readonly Node[]): string[] {
  return [...new Set(nodes.flatMap((node) => node.partitions))].sort();
}

/** What the nodes shown are filtered by. */
export interface NodeFilter {
  /** Text the name contains, in any case. */
  readonly text: string;
  /** The states shown; none for every state. */
  readonly states: readonly string[];
  /** The partition the nodes are in; empty for every partition. */
  readonly partition: string;
}

/** Whether a node passes every filter. */
export function passes(node: Node, filter: NodeFilter): boolean {
  return (
    node.name.toLowerCase().includes(filter.text.toLowerCase()) &&
    (filter.states.length === 0 || filter.states.includes(stateOf(node))) &&
    (filter.partition === "" || node.partitions.includes(filter.partition))
  );
}

/** How many of the nodes show each state. */
export function countStates(nodes: readonly Node[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const state = stateOf(node);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return counts;
}
