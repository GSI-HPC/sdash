// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";

import openapi from "../../../api/openapi.yaml?raw";
import {
  ApiError,
  basePath,
  createClient,
  createTransport,
  csrfHeader,
  ErrorCode,
} from "./client";

/** A request as the fake server saw it. */
interface Seen {
  url: string;
  init: RequestInit | undefined;
}

/**
 * A client whose requests go to a function that stands in for the server,
 * and the requests that function was sent.
 */
function clientOf(respond: () => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const client = createClient((input, init) => {
    // The client names the address as a string; a URL or a Request would
    // mean it had started to build its requests another way.
    if (typeof input !== "string") {
      throw new TypeError("the client was expected to pass a string");
    }
    seen.push({ url: input, init });
    return Promise.resolve(respond());
  });
  return { client, seen };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const status = {
  version: "v1.4.0",
  goVersion: "go1.27.1",
  platform: "linux/arm64",
  readOnly: false,
  clusters: [],
};

/** Runs a call that is expected to fail and returns what it failed with. */
async function failureOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("the call was expected to fail");
}

// The base path is written down in the document, in the server's router and
// here, and the generated types carry it only as a type that any string
// satisfies. Nothing but a test ties this copy to the document.
test("the base path is the server of the document", () => {
  const servers = /^servers:\n(?:\s*#.*\n)*\s*- url: (\S+)$/m.exec(openapi);

  expect(servers?.[1]).toBe(basePath);
});

test("a call asks under the base path and resolves with the answer", async () => {
  const { client, seen } = clientOf(() => json(200, status));

  await expect(client.getStatus()).resolves.toEqual(status);

  expect(seen.map(({ url }) => url)).toEqual(["/api/v1/status"]);
});

// A view that has gone must be able to drop its request; the query library
// hands the signal over for that.
test("the caller's signal reaches fetch", async () => {
  const { client, seen } = clientOf(() => json(200, status));
  const { signal } = new AbortController();

  await client.getStatus({ signal });

  expect(seen[0]?.init?.signal).toBe(signal);
});

test("a failure the API reports carries its status, its code and its message", async () => {
  const { client } = clientOf(() =>
    json(401, { code: "not_signed_in", message: "not signed in" }),
  );

  const error = await failureOf(client.getStatus());

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 401,
    code: ErrorCode.NOT_SIGNED_IN,
    message: "not signed in",
  });
});

// A sdash started with --read-only refuses what could change something
// before any operation sees it. A view tells that refusal from every other
// by its code, where the status 403 is shared with a request from another
// origin.
test("a refusal in read-only mode carries the code of the mode", async () => {
  const { client } = clientOf(() =>
    json(403, {
      code: "read_only",
      message: "sdash runs read-only and changes nothing",
    }),
  );

  const error = await failureOf(client.getStatus());

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 403,
    code: ErrorCode.READ_ONLY,
    message: "sdash runs read-only and changes nothing",
  });
});

// A tab that stays open across an upgrade of sdash runs the old interface
// against the new server. The message is still for the user; the code is
// left out, so that nobody compares it with a list it is not in.
test("a code this build does not know keeps its message and has no code", async () => {
  const { client } = clientOf(() =>
    json(502, { code: "cluster_unreachable", message: "no answer" }),
  );

  const error = await failureOf(client.getStatus());

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 502, message: "no answer" });
  expect((error as ApiError).code).toBeUndefined();
});

// What answers in place of the API does not know its error shape: the Vite
// dev server without an sdash behind it, or sdash's own check of the Host
// header. The status is then all there is to tell.
test.each([
  {
    name: "plain text",
    response: () =>
      new Response("requests for this host are refused\n", {
        status: 403,
        statusText: "Forbidden",
      }),
    message: "the server answered 403 Forbidden",
  },
  {
    name: "no body and no status text",
    response: () => new Response(null, { status: 502 }),
    message: "the server answered 502",
  },
  {
    name: "JSON of another shape",
    response: () => json(500, { error: "boom" }),
    message: "the server answered 500",
  },
])(
  "a failure that is not the API's is told by its status: $name",
  async ({ response, message }) => {
    const { client } = clientOf(response);

    const error = await failureOf(client.getStatus());

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(message);
    expect((error as ApiError).code).toBeUndefined();
  },
);

// Something other than sdash may hold the port and answer 200 with a page
// of its own. That is an answer, and a caller that took it for none would
// tell the user that sdash has stopped.
test("an answer that is not JSON is a failure with its status", async () => {
  const { client } = clientOf(
    () =>
      new Response("<!doctype html><title>not sdash</title>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
  );

  const error = await failureOf(client.getStatus());

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 200,
    message: "the server answered with something that is not JSON",
  });
  expect((error as ApiError).code).toBeUndefined();
});

// A body that cannot be read to its end is no answer either, and is not
// dressed up as one.
test("a body that breaks off rejects with what the read rejected with", async () => {
  const broken = new TypeError("terminated");
  const { client } = clientOf(() => {
    const response = new Response(null, { status: 200 });
    response.json = () => Promise.reject(broken);
    return response;
  });

  await expect(client.getStatus()).rejects.toBe(broken);
});

// No answer is not an ApiError: the caller tells a server that refused from
// one that is not there by the kind of the error.
test("a request that gets no answer rejects with what fetch rejected with", async () => {
  const gone = new TypeError("Failed to fetch");
  const { client } = clientOf(() => Promise.reject(gone));

  await expect(client.getStatus()).rejects.toBe(gone);
});

// The header is written down in the document, in the server and here, and the
// generated types carry it only in a sentence. Nothing but a test ties this
// copy to the document.
test("the CSRF header is the one of the document", () => {
  expect(openapi).toContain(`\`${csrfHeader}\``);
});

test("a call for the session resolves with the session", async () => {
  const { client, seen } = clientOf(() => json(200, { csrfToken: "T0KEN" }));

  await expect(client.getSession()).resolves.toEqual({ csrfToken: "T0KEN" });

  expect(seen.map(({ url }) => url)).toEqual(["/api/v1/session"]);
});

/** The headers of a request, whichever form fetch was given them in. */
function headersOf(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

// A read changes nothing, so it sends no token and does not ask for one.
test.each(["GET", "HEAD"])("a %s sends no CSRF token", async (method) => {
  const { transport, seen } = transportOf(() => json(200, {}));

  await transport.send("/status", {}, method);

  expect(seen).toHaveLength(1);
  expect(headersOf(seen[0]?.init).has(csrfHeader)).toBe(false);
});

// No operation of the API changes anything yet; the rule is held to the
// transport, which the first one will use.
test.each(["POST", "PUT", "PATCH", "DELETE"])(
  "a %s reads the token of the session and sends it",
  async (method) => {
    const { transport, seen } = transportOf((url) =>
      url.endsWith("/session")
        ? json(200, { csrfToken: "T0KEN" })
        : json(200, {}),
    );

    await transport.send("/jobs", {}, method);

    expect(seen.map(({ url, init }) => [init?.method, url])).toEqual([
      ["GET", "/api/v1/session"],
      [method, "/api/v1/jobs"],
    ]);
    expect(headersOf(seen[1]?.init).get(csrfHeader)).toBe("T0KEN");
    expect(headersOf(seen[0]?.init).has(csrfHeader)).toBe(false);
  },
);

test("the token is read once for requests that follow each other or start together", async () => {
  const { transport, seen } = transportOf((url) =>
    url.endsWith("/session")
      ? json(200, { csrfToken: "T0KEN" })
      : json(200, {}),
  );

  await Promise.all([
    transport.send("/jobs", {}, "POST"),
    transport.send("/jobs", {}, "DELETE"),
  ]);
  await transport.send("/jobs", {}, "POST");

  expect(seen.filter(({ url }) => url.endsWith("/session"))).toHaveLength(1);
  expect(seen).toHaveLength(4);
});

// A request that cannot be sent without a token is not sent without one.
test("a token that cannot be read fails the request before it is sent, and is read again next time", async () => {
  let answer = () => json(500, { code: "internal", message: "no" });
  const { transport, seen } = transportOf((url) =>
    url.endsWith("/session") ? answer() : json(200, {}),
  );

  await expect(transport.send("/jobs", {}, "POST")).rejects.toMatchObject({
    status: 500,
  });
  expect(seen.map(({ url }) => url)).toEqual(["/api/v1/session"]);

  answer = () => json(200, { csrfToken: "T0KEN" });
  await transport.send("/jobs", {}, "POST");

  expect(seen.map(({ url }) => url)).toEqual([
    "/api/v1/session",
    "/api/v1/session",
    "/api/v1/jobs",
  ]);
});

// The server forgets the token when it restarts, or the page is of an older
// run: the refusal says so, and the next request reads the token again.
test("a refusal for the token drops it, so that the next request reads it again", async () => {
  let tokens = 0;
  let refuse = true;
  const { transport, seen } = transportOf((url) => {
    if (url.endsWith("/session")) {
      tokens += 1;
      return json(200, { csrfToken: `T0KEN${String(tokens)}` });
    }
    return refuse
      ? json(403, { code: "csrf", message: "reload the page" })
      : json(200, {});
  });

  await expect(transport.send("/jobs", {}, "POST")).rejects.toMatchObject({
    status: 403,
    code: ErrorCode.CSRF,
  });
  refuse = false;
  await transport.send("/jobs", {}, "POST");

  expect(headersOf(seen[1]?.init).get(csrfHeader)).toBe("T0KEN1");
  expect(headersOf(seen[3]?.init).get(csrfHeader)).toBe("T0KEN2");
});

// Another refusal does not say the token is wrong.
test("a refusal of another kind keeps the token", async () => {
  const { transport, seen } = transportOf((url) =>
    url.endsWith("/session")
      ? json(200, { csrfToken: "T0KEN" })
      : json(403, { code: "read_only", message: "read-only" }),
  );

  await expect(transport.send("/jobs", {}, "POST")).rejects.toMatchObject({
    code: ErrorCode.READ_ONLY,
  });
  await expect(transport.send("/jobs", {}, "POST")).rejects.toMatchObject({
    code: ErrorCode.READ_ONLY,
  });

  expect(seen.filter(({ url }) => url.endsWith("/session"))).toHaveLength(1);
});

// The operations on a cluster name it in their path, and the document has
// an array in the query sent as one parameter for each of its values.
test("a call on a cluster names it in the path and its parameters in the query", async () => {
  const { client, seen } = clientOf(() => json(200, {}));

  await client.getPulse("virgo", ["jobs", "nodes"]);
  await client.getJobs("a b/c", {
    state: ["PENDING", "RUNNING"],
    sort: "submitted",
    order: "desc",
    offset: 0,
    limit: 50,
  });
  await client.getJobs("virgo");
  await client.getNodes("virgo");
  await client.getPartitions("virgo");
  await client.getPulse("virgo", []);

  expect(seen.map(({ url }) => url)).toEqual([
    "/api/v1/clusters/virgo/pulse?kinds=jobs&kinds=nodes",
    "/api/v1/clusters/a%20b%2Fc/jobs?state=PENDING&state=RUNNING&sort=submitted&order=desc&offset=0&limit=50",
    "/api/v1/clusters/virgo/jobs",
    "/api/v1/clusters/virgo/nodes",
    "/api/v1/clusters/virgo/partitions",
    "/api/v1/clusters/virgo/pulse",
  ]);
});

// What a cluster could not give is an Error of one of the codes of the
// upstream, and reaches the caller as such.
test("a read the cluster cannot answer rejects with the code of the cause", async () => {
  const { client } = clientOf(() =>
    json(502, { code: "unauthenticated", message: "the token expired" }),
  );

  const error = await failureOf(client.getJobs("virgo"));

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 502,
    code: ErrorCode.UNAUTHENTICATED,
    message: "the token expired",
  });
});

/** A transport whose requests go to a function that stands in for the server. */
function transportOf(respond: (url: string) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const transport = createTransport((input, init) => {
    if (typeof input !== "string") {
      throw new TypeError("the transport was expected to pass a string");
    }
    seen.push({ url: input, init });
    return Promise.resolve(respond(input));
  });
  return { transport, seen };
}
