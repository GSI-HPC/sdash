// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { ApiError, ErrorCode, type Pulse } from "../client/client";

/** A failure as a view tells it: what failed, and what it means. */
export interface Failure {
  /** What went wrong, in a sentence. */
  readonly title: string;
  /** What it means for the user, or what they can do. */
  readonly text: string;
  /** The message of whatever failed, for whoever reports it. */
  readonly code?: string;
}

/** The body of an error, as an answer of the API holds one. */
type ErrorBody = NonNullable<Pulse["connection"]["error"]>;

/**
 * Says why sdash could not give the data of a cluster, from the code of
 * the error: the code says what the user can do, the message says what
 * slurmrestd answered. An error without an answer of the API is sdash
 * that does not answer at all.
 */
export function failureOf(error: Error | ErrorBody): Failure {
  if (error instanceof Error && !(error instanceof ApiError)) {
    // fetch rejects with a message that differs from browser to browser
    // and names no cause a user could act on.
    return {
      title: "sdash does not answer.",
      text: "It may have been stopped: start it again and open the address it prints.",
    };
  }
  const code = error.code;
  const message = error.message;
  switch (code) {
    case ErrorCode.UNAUTHENTICATED:
      return {
        title: "slurmrestd did not accept the token.",
        text: "The token the profile file names is missing, malformed or expired. sdash reads it again with the next request.",
        code: message,
      };
    case ErrorCode.FORBIDDEN:
      return {
        title: "Slurm refused the request.",
        text: "The user of the token may not read this.",
        code: message,
      };
    case ErrorCode.UNAVAILABLE:
      return {
        title: "slurmrestd does not answer.",
        text: "It, or slurmctld behind it, cannot be reached at the moment. sdash tries again with the next fetch.",
        code: message,
      };
    case ErrorCode.UNSUPPORTED:
      return {
        title: "sdash cannot speak to this slurmrestd.",
        text: "Its Slurm release offers no data_parser that this sdash knows.",
        code: message,
      };
    default:
      return {
        title: "slurmrestd answered with an error.",
        text: "sdash tries again with the next fetch.",
        code: message,
      };
  }
}
