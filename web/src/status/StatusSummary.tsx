// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { ApiError, client } from "../client/client";

/**
 * Says which sdash serves the page: its version and the platform it was
 * built for, as the status operation of the API reports them, and that it
 * runs read-only when it does.
 *
 * The mode is told in words, in the list the rest of the status is in. A
 * badge whose colour alone set it apart would tell nothing to a user who
 * does not see the colour, and a text outside the status region would not
 * be announced with the answer.
 *
 * The three states reach assistive technology as well as the eye
 * (doc/adr/0014-accessibility-and-browsers.md). The status region is in the
 * page from the first render and holds first the loading text and then the
 * answer, so a screen reader announces the answer when it replaces the
 * text, without the user having to go and look. A failure is an alert,
 * which is announced at once: with no answer from the server, nothing else
 * on the page can be relied on either.
 */
export function StatusSummary() {
  const headingId = useId();
  const status = useQuery({
    queryKey: ["status"],
    queryFn: ({ signal }) => client.getStatus({ signal }),
  });

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-sm font-semibold">
        About
      </h2>
      <div role="status" className="mt-2">
        {status.isPending && (
          <p className="text-t2">Loading the version of sdash…</p>
        )}
        {status.isSuccess && (
          <dl className="grid w-fit grid-cols-[auto_auto] gap-x-4 gap-y-1">
            <dt className="text-t2">Version</dt>
            <dd className="font-mono">{status.data.version}</dd>
            <dt className="text-t2">Platform</dt>
            <dd className="font-mono">{status.data.platform}</dd>
            {status.data.readOnly && (
              <>
                <dt className="text-t2">Mode</dt>
                <dd>Read-only: this sdash changes nothing on a cluster</dd>
              </>
            )}
          </dl>
        )}
      </div>
      {status.isError && (
        <p
          role="alert"
          className="mt-2 w-fit rounded-md bg-err-bg px-3 py-2 text-err-fg"
        >
          {failure(status.error)}
        </p>
      )}
    </section>
  );
}

/** Says why there is no status to show, in words for the user. */
function failure(error: Error): string {
  if (error instanceof ApiError) {
    return `sdash did not report its version: ${error.message}`;
  }
  // No answer at all: fetch rejects with a message that differs from
  // browser to browser and names no cause a user could act on.
  return "sdash does not answer. It may have been stopped: start it again and open the address it prints.";
}
