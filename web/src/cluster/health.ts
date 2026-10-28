// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { ErrorCode, type Pulse } from "../client/client";
import { failureOf } from "./failure";

/** The tones of the state of a cluster: none to tell, fine, a warning, a failure. */
export type HealthTone = "neutral" | "ok" | "warn" | "err";

/** The state of a cluster as the status pill tells it. */
export interface Health {
  readonly tone: HealthTone;
  /** A word or two, the text of the pill. */
  readonly word: string;
  /** What the word means, in a sentence. */
  readonly text: string;
}

/** The body of an error, as the pulse holds one. */
type ErrorBody = NonNullable<Pulse["connection"]["error"]>;

/**
 * The word for a failure: "Auth" for a token slurmrestd refused,
 * "Offline" for a slurmrestd that does not answer, "Error" for the rest.
 * The words are the handoff's (doc/design/README.md, "Connection status").
 */
function wordOf(error: ErrorBody): string {
  switch (error.code) {
    case ErrorCode.UNAUTHENTICATED:
      return "Auth";
    case ErrorCode.UNAVAILABLE:
      return "Offline";
    default:
      return "Error";
  }
}

/**
 * The state of a cluster from its pulse: a connection that failed, else a
 * kind whose last fetch failed, else live, else not connected yet. A kind
 * that failed is "Degraded", as its data are older than they should be,
 * except for a refused token, which fails whatever is asked next.
 */
export function healthOf(pulse: Pulse): Health {
  const { connection } = pulse;
  if (connection.error !== undefined) {
    return {
      tone: "err",
      word: wordOf(connection.error),
      text: failureOf(connection.error).title,
    };
  }
  const failed = pulse.kinds.find((kind) => kind.error !== undefined)?.error;
  if (connection.connected && failed !== undefined) {
    return failed.code === ErrorCode.UNAUTHENTICATED
      ? { tone: "err", word: "Auth", text: failureOf(failed).title }
      : { tone: "warn", word: "Degraded", text: failureOf(failed).title };
  }
  if (connection.connected) {
    return {
      tone: "ok",
      word: "Live",
      text: "sdash is connected to slurmrestd.",
    };
  }
  return pulse.kinds.length === 0
    ? {
        tone: "neutral",
        word: "Idle",
        text: "sdash connects to slurmrestd when a view asks for the data of the cluster.",
      }
    : {
        tone: "neutral",
        word: "Connecting",
        text: "sdash is connecting to slurmrestd.",
      };
}
