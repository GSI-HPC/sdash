// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import {
  cellOf,
  countStates,
  memory,
  type Node,
  passes,
  stateOf,
  wordOf,
} from "./nodes";

function node(more: Partial<Node> = {}): Node {
  return {
    name: "node-1",
    state: "IDLE",
    flags: [],
    partitions: ["main"],
    features: [],
    cpus: 8,
    allocCpus: 0,
    load: 0.25,
    memory: 2048,
    allocMemory: 0,
    ...more,
  };
}

describe("the state a node shows", () => {
  test("is its base state where it has no flag that says more", () => {
    expect(stateOf(node({ state: "MIXED" }))).toBe("MIXED");
  });

  test("is DRAIN for a node drained or draining, whatever it does meanwhile", () => {
    expect(stateOf(node({ state: "IDLE", flags: ["DRAIN"] }))).toBe("DRAIN");
    expect(stateOf(node({ state: "MIXED", flags: ["DRAIN"] }))).toBe("DRAIN");
  });

  test("is DOWN for a node that is down or does not respond, drained or not", () => {
    expect(stateOf(node({ state: "DOWN", flags: ["DRAIN"] }))).toBe("DOWN");
    expect(stateOf(node({ state: "IDLE", flags: ["NOT_RESPONDING"] }))).toBe(
      "DOWN",
    );
  });

  test("is RESERVED for a node in a reservation", () => {
    expect(stateOf(node({ flags: ["RESERVED"] }))).toBe("RESERVED");
  });
});

test("a state is a word of a sentence, the legend's where it has one", () => {
  expect(wordOf("DRAIN")).toBe("Drain");
  expect(wordOf("POWERED_DOWN")).toBe("Powered down");
});

test("memory is written in the largest unit it fills, as Slurm counts it", () => {
  expect(memory(512)).toBe("512 MB");
  expect(memory(1536)).toBe("1.5 GB");
  expect(memory(2 * 1024 * 1024)).toBe("2 TB");
});

describe("the cell of a node", () => {
  test("is named by the node and holds its figures and its reason", () => {
    const cell = cellOf(
      node({
        allocCpus: 4,
        allocMemory: 1024,
        reason: "bad disk",
        flags: ["DRAIN"],
      }),
    );
    expect(cell).toMatchObject({ id: "node-1", label: "node-1", tone: "warn" });
    expect(cell.detail).toBe(
      "4 of 8 CPUs allocated, load 0.25, 1 GB of 2 GB memory allocated, reason: bad disk",
    );
  });

  test("says a state that the legend has no tone for", () => {
    const cell = cellOf(node({ state: "FUTURE" }));
    expect(cell.tone).toBe("neutral");
    expect(cell.detail).toMatch(/^Future, /);
  });
});

test("a node passes the filters when its name, its state and its partition all match", () => {
  const drained = node({
    name: "gpu-07",
    flags: ["DRAIN"],
    partitions: ["gpu"],
  });
  const none = { text: "", states: [], partition: "" };
  expect(passes(drained, none)).toBe(true);
  expect(passes(drained, { ...none, text: "GPU" })).toBe(true);
  expect(passes(drained, { ...none, text: "cpu" })).toBe(false);
  expect(passes(drained, { ...none, states: ["DRAIN", "DOWN"] })).toBe(true);
  expect(passes(drained, { ...none, states: ["IDLE"] })).toBe(false);
  expect(passes(drained, { ...none, partition: "gpu" })).toBe(true);
  expect(passes(drained, { ...none, partition: "main" })).toBe(false);
});

test("the nodes are counted by the state they show", () => {
  expect(
    countStates([node(), node({ flags: ["DRAIN"] }), node({ name: "x" })]),
  ).toEqual(
    new Map([
      ["IDLE", 2],
      ["DRAIN", 1],
    ]),
  );
});
