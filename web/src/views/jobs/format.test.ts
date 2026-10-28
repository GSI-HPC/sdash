// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import type { Job } from "../../client/client";
import { duration, elapsed, limit, toneOf, wordOf } from "./format";

function job(more: Partial<Job>): Job {
  return {
    id: 1,
    displayId: "1",
    name: "example",
    user: "alice",
    account: "physics",
    partition: "main",
    qos: "normal",
    state: "RUNNING",
    flags: [],
    ...more,
  };
}

const at = new Date("2026-01-02T00:00:00Z");

describe("a length of time", () => {
  test.each([
    [0, "00:00:00"],
    [59, "00:00:59"],
    [3600, "01:00:00"],
    [86_399, "23:59:59"],
    [86_400, "1-00:00:00"],
    [93_784, "1-02:03:04"],
    [-5, "00:00:00"],
  ])("of %d seconds is written %s, as squeue writes it", (seconds, written) => {
    expect(duration(seconds)).toBe(written);
  });
});

describe("how long a job has run", () => {
  test("is counted to the moment given while it runs, whatever end slurmctld expects", () => {
    expect(
      elapsed(
        job({
          startTime: "2026-01-01T23:00:00Z",
          endTime: "2026-01-03T00:00:00Z",
        }),
        at,
      ),
    ).toBe(3600);
  });

  test("is from its start to its end once it has ended", () => {
    expect(
      elapsed(
        job({
          state: "COMPLETED",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-01-01T00:01:00Z",
        }),
        at,
      ),
    ).toBe(60);
  });

  test("is nothing while it waits, whatever start slurmctld expects", () => {
    expect(
      elapsed(job({ state: "PENDING", startTime: "2026-01-01T00:00:00Z" }), at),
    ).toBe(0);
  });
});

test("a time limit is written as a length of time, and its absence as no limit", () => {
  expect(limit(job({ timeLimit: 90 }))).toBe("01:30:00");
  expect(limit(job({}))).toBe("no limit");
});

test("a state has the tone of the handoff, and one it does not name is neutral", () => {
  expect(toneOf("RUNNING")).toBe("ok");
  expect(toneOf("PENDING")).toBe("warn");
  expect(toneOf("FAILED")).toBe("err");
  expect(toneOf("TIMEOUT")).toBe("org");
  expect(toneOf("SUSPENDED")).toBe("vio");
  expect(toneOf("COMPLETED")).toBe("info");
  expect(toneOf("CANCELLED")).toBe("neutral");
  expect(toneOf("SOMETHING_NEW")).toBe("neutral");
});

test("a state is a word of a sentence", () => {
  expect(wordOf("RUNNING")).toBe("Running");
  expect(wordOf("OUT_OF_MEMORY")).toBe("Out of memory");
});
