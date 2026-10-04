// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// The client of sdash's browser API, and the one place the user interface
// calls the server from (doc/adr/0011-openapi-first-browser-api.md).
//
// The types of what an operation takes and gives are generated from
// api/openapi.yaml into ../api/. This module adds the calls, one function
// for each operation, written against those types: an operation that
// changes in the document without its function following fails the type
// check.

import {
  ErrorCode,
  type Error as ErrorBody,
  type GetStatusData,
  type GetStatusResponse,
} from "../api/types.gen";

export { ErrorCode };

/** What the status operation answers. */
export type Status = GetStatusResponse;

/**
 * The base path of the API, the server of api/openapi.yaml. It is relative,
 * so the requests go to whichever address the page was loaded from.
 * client.test.ts holds it to the document.
 */
export const basePath = "/api/v1";

/**
 * A request that the server answered, but not with what was asked for. The
 * message is the server's, written for the person at the browser.
 */
export class ApiError extends Error {
  override readonly name = "ApiError";
  /** The HTTP status of the answer. */
  readonly status: number;
  /**
   * The cause as the document names it. Undefined when the answer did not
   * come from the API or names a cause this build does not know; see
   * errorOf.
   */
  readonly code: ErrorCode | undefined;

  constructor(status: number, message: string, code?: ErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** What every call takes besides the parameters of its operation. */
export interface CallOptions {
  /** Aborts the request, as when the view that asked for it has gone. */
  signal?: AbortSignal;
}

/** The operations of the API, one function each. */
export interface Client {
  /**
   * Says which sdash is running, whether it runs read-only, and which
   * clusters it is configured for.
   */
  getStatus(options?: CallOptions): Promise<Status>;
}

/**
 * Makes a client that sends its requests with the given fetch. The
 * application uses the one below, on the browser's fetch; a test hands in
 * its own and needs no server.
 *
 * A call resolves with what the operation answers. It rejects with an
 * ApiError when the server answers with a failure or with a body that is
 * not JSON, and with whatever fetch rejects with when no answer arrives:
 * the request was aborted, or sdash is not running any more.
 */
export function createClient(fetch: typeof globalThis.fetch): Client {
  async function send(url: string, options: CallOptions): Promise<Response> {
    const response = await fetch(basePath + url, {
      headers: { Accept: "application/json" },
      signal: options.signal ?? null,
    });
    if (!response.ok) {
      throw await errorOf(response);
    }
    return response;
  }

  return {
    async getStatus(options = {}) {
      const url: GetStatusData["url"] = "/status";
      const response = await send(url, options);
      return (await bodyOf(response)) as GetStatusResponse;
    },
  };
}

/**
 * Reads the body of an answer that is no failure.
 *
 * A body that is not JSON did not come from the API: something else answers
 * on the port. That is an answer, so it is an ApiError and not the missing
 * answer a caller would otherwise take it for. Anything else that keeps the
 * body from being read, an abort or a connection that broke, is passed on
 * as it is.
 */
async function bodyOf(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(
        response.status,
        "the server answered with something that is not JSON",
      );
    }
    throw error;
  }
}

/**
 * The client of the application. It looks the browser's fetch up at each
 * call and not once, so that a component test can put its own in its place.
 */
export const client = createClient((input, init) =>
  globalThis.fetch(input, init),
);

/**
 * Turns an answer that is a failure into an ApiError.
 *
 * Whatever the API refuses, it answers with the Error of the document. Two
 * things are allowed for all the same. The answer may come from something
 * in front of the API and have another body, or none: the Vite dev server
 * when no sdash runs behind it, or sdash itself for a request that names it
 * by a host it does not answer to. And the page may be older than the
 * server, when a new sdash was started on the port an open tab was loaded
 * from, and then meets a code its build does not know.
 */
async function errorOf(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  if (isErrorBody(body)) {
    return new ApiError(
      response.status,
      body.message,
      isErrorCode(body.code) ? body.code : undefined,
    );
  }
  return new ApiError(
    response.status,
    `the server answered ${String(response.status)} ${response.statusText}`.trimEnd(),
  );
}

/** An Error as far as its shape goes: the code may be one nobody knows. */
function isErrorBody(
  body: unknown,
): body is Omit<ErrorBody, "code"> & { code: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string" &&
    "message" in body &&
    typeof body.message === "string"
  );
}

function isErrorCode(code: string): code is ErrorCode {
  return Object.values<string>(ErrorCode).includes(code);
}
