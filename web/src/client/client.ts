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
  type GetJobsData,
  type GetJobsResponse,
  type GetNodesData,
  type GetNodesResponse,
  type GetPartitionsData,
  type GetPartitionsResponse,
  type GetPulseData,
  type GetPulseResponse,
  type GetSessionData,
  type GetSessionResponse,
  type GetStatusData,
  type GetStatusResponse,
} from "../api/types.gen";

export { ErrorCode };

/** What the status operation answers. */
export type Status = GetStatusResponse;

/** What the session operation answers. */
export type Session = GetSessionResponse;

/** What the pulse of a cluster answers. */
export type Pulse = GetPulseResponse;

/** What a page of the jobs of a cluster answers. */
export type JobList = GetJobsResponse;

/** The filters, the order and the window of a page of jobs. */
export type JobQuery = NonNullable<GetJobsData["query"]>;

/** What the nodes of a cluster answer. */
export type NodeList = GetNodesResponse;

/** What the partitions of a cluster answer. */
export type PartitionList = GetPartitionsResponse;

/** A kind of a cluster's data. */
export type DataKind = NonNullable<
  NonNullable<GetPulseData["query"]>["kinds"]
>[number];

/**
 * The base path of the API, the server of api/openapi.yaml. It is relative,
 * so the requests go to whichever address the page was loaded from.
 * client.test.ts holds it to the document.
 */
export const basePath = "/api/v1";

/**
 * The header that carries the CSRF token of the session on a request that
 * could change something. The server refuses such a request without it,
 * before any operation sees it. client.test.ts holds the name to the
 * document.
 */
export const csrfHeader = "X-Sdash-CSRF";

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
  /**
   * Gives the CSRF token of the session. The transport sends it by itself on
   * a request that could change something; a view has no use for it.
   */
  getSession(options?: CallOptions): Promise<Session>;
  /**
   * Says whether sdash is connected to the cluster, and how far each kind
   * asked for has got. The kinds asked for stay watched: sdash fetches
   * them from the cluster for as long as a page asks.
   */
  getPulse(
    cluster: string,
    kinds: readonly DataKind[],
    options?: CallOptions,
  ): Promise<Pulse>;
  /** Gives a page of the jobs of the cluster. */
  getJobs(
    cluster: string,
    query?: JobQuery,
    options?: CallOptions,
  ): Promise<JobList>;
  /** Gives the nodes of the cluster. */
  getNodes(cluster: string, options?: CallOptions): Promise<NodeList>;
  /** Gives the partitions of the cluster. */
  getPartitions(cluster: string, options?: CallOptions): Promise<PartitionList>;
}

/** Sends a request to the API, and rejects with an ApiError if it fails. */
export interface Transport {
  /**
   * Sends a request of method to url, relative to the base path. A request
   * that could change something, which is any but GET and HEAD, carries the
   * CSRF token of the session in csrfHeader. The token is read once with
   * the session operation and kept. When the server refuses a request for
   * lacking it, the kept token is dropped, so that the next request reads it
   * again; the refusal is still the caller's to see.
   */
  send(url: string, options?: CallOptions, method?: string): Promise<Response>;
}

/**
 * Makes the transport of the calls on the given fetch: the headers every
 * request carries, the CSRF token of the ones that could change something,
 * and the rejection of an answer that is a failure.
 */
export function createTransport(fetch: typeof globalThis.fetch): Transport {
  async function request(
    method: string,
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const response = await fetch(basePath + url, {
      method,
      headers: { Accept: "application/json", ...headers },
      signal: signal ?? null,
    });
    if (!response.ok) {
      throw await errorOf(response);
    }
    return response;
  }

  // The token is kept as the promise of it, so that requests that start
  // together read it once.
  let token: Promise<string> | undefined;
  function csrfToken(signal: AbortSignal | undefined): Promise<string> {
    const url: GetSessionData["url"] = "/session";
    token ??= request("GET", url, {}, signal)
      .then(
        async (response) =>
          ((await bodyOf(response)) as GetSessionResponse).csrfToken,
      )
      .catch((error: unknown) => {
        // A token that could not be read is read again by the next request.
        token = undefined;
        throw error;
      });
    return token;
  }

  return {
    async send(url, options = {}, method = "GET") {
      const headers: Record<string, string> = {};
      if (method !== "GET" && method !== "HEAD") {
        headers[csrfHeader] = await csrfToken(options.signal);
      }
      try {
        return await request(method, url, headers, options.signal);
      } catch (error) {
        if (error instanceof ApiError && error.code === ErrorCode.CSRF) {
          token = undefined;
        }
        throw error;
      }
    },
  };
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
  const transport = createTransport(fetch);

  return {
    async getStatus(options = {}) {
      const url: GetStatusData["url"] = "/status";
      const response = await transport.send(url, options);
      return (await bodyOf(response)) as GetStatusResponse;
    },
    async getSession(options = {}) {
      const url: GetSessionData["url"] = "/session";
      const response = await transport.send(url, options);
      return (await bodyOf(response)) as GetSessionResponse;
    },
    async getPulse(cluster, kinds, options = {}) {
      const path: GetPulseData["url"] = "/clusters/{cluster}/pulse";
      const url = clusterPath(path, cluster) + queryOf({ kinds });
      const response = await transport.send(url, options);
      return (await bodyOf(response)) as GetPulseResponse;
    },
    async getJobs(cluster, query = {}, options = {}) {
      const path: GetJobsData["url"] = "/clusters/{cluster}/jobs";
      const url = clusterPath(path, cluster) + queryOf(query);
      const response = await transport.send(url, options);
      return (await bodyOf(response)) as GetJobsResponse;
    },
    async getNodes(cluster, options = {}) {
      const path: GetNodesData["url"] = "/clusters/{cluster}/nodes";
      const response = await transport.send(
        clusterPath(path, cluster),
        options,
      );
      return (await bodyOf(response)) as GetNodesResponse;
    },
    async getPartitions(cluster, options = {}) {
      const path: GetPartitionsData["url"] = "/clusters/{cluster}/partitions";
      const response = await transport.send(
        clusterPath(path, cluster),
        options,
      );
      return (await bodyOf(response)) as GetPartitionsResponse;
    },
  };
}

/** The path of an operation on a cluster, with its name as one segment. */
function clusterPath(path: string, cluster: string): string {
  return path.replace("{cluster}", encodeURIComponent(cluster));
}

/**
 * The query string of the parameters, as the document has them read: an
 * array is one parameter for each of its values (style form, explode), and
 * a parameter that is undefined is left out. Empty when there is none.
 */
function queryOf(
  parameters: Record<string, string | number | readonly string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined) {
      continue;
    }
    for (const one of typeof value === "object" ? value : [value]) {
      query.append(name, String(one));
    }
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
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
