// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import { ErrorCode, type Pulse } from "../client/client";
import { healthOf } from "./health";

const fetchedAt = "2026-01-01T12:00:00Z";

function pulse(more: Partial<Pulse> = {}): Pulse {
  return {
    connection: { connected: true, user: "alice" },
    kinds: [{ kind: "jobs", generation: 1, fetchedAt, period: 30 }],
    ...more,
  };
}

test("a cluster connected without a failure is live", () => {
  expect(healthOf(pulse())).toMatchObject({ tone: "ok", word: "Live" });
});

test("a connection that failed is told by the code of its error", () => {
  const failed = (code: ErrorCode) =>
    healthOf(
      pulse({
        connection: { connected: false, error: { code, message: "no" } },
        kinds: [],
      }),
    );
  expect(failed(ErrorCode.UNAUTHENTICATED)).toMatchObject({
    tone: "err",
    word: "Auth",
    text: "slurmrestd did not accept the token.",
  });
  expect(failed(ErrorCode.UNAVAILABLE)).toMatchObject({
    tone: "err",
    word: "Offline",
  });
  expect(failed(ErrorCode.UNSUPPORTED)).toMatchObject({
    tone: "err",
    word: "Error",
  });
});

test("a kind whose last fetch failed leaves the cluster degraded, and a refused token fails it", () => {
  const kind = (code: ErrorCode) =>
    healthOf(
      pulse({
        kinds: [
          {
            kind: "jobs",
            generation: 1,
            fetchedAt,
            period: 30,
            error: { code, message: "no" },
          },
        ],
      }),
    );
  expect(kind(ErrorCode.UNAVAILABLE)).toMatchObject({
    tone: "warn",
    word: "Degraded",
  });
  expect(kind(ErrorCode.UNAUTHENTICATED)).toMatchObject({
    tone: "err",
    word: "Auth",
  });
});

test("a cluster not connected yet is connecting while a view asks for its data, and idle otherwise", () => {
  const unconnected = { connected: false };
  expect(healthOf(pulse({ connection: unconnected }))).toMatchObject({
    tone: "neutral",
    word: "Connecting",
  });
  expect(healthOf(pulse({ connection: unconnected, kinds: [] }))).toMatchObject(
    { tone: "neutral", word: "Idle" },
  );
});
