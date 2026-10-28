// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { Pulse } from "../client/client";

/** Data of a kind, cut from one generation of it. */
interface Cut {
  readonly generation: number;
}

/**
 * Asks for the data of a query again when the pulse reports a newer
 * generation of their kind than they were cut from, and returns the
 * generation they hold: undefined while the query has neither data nor
 * an error.
 *
 * A read that failed with nothing held counts as the generation the pulse
 * reported when it failed, so that it is asked for again once the data
 * change. Asked for again at once, a read that fails while sdash holds
 * data would be asked for in a loop.
 */
export function useFollow(
  query: UseQueryResult<Cut>,
  known: number | undefined,
): number | undefined {
  const [failure, setFailure] = useState({ at: 0, generation: 0 });
  if (query.isError && query.errorUpdatedAt !== failure.at) {
    setFailure({ at: query.errorUpdatedAt, generation: known ?? 0 });
  }
  const held =
    query.data?.generation ?? (query.isError ? failure.generation : undefined);
  const { refetch } = query;
  useEffect(() => {
    if (known !== undefined && held !== undefined && known > held) {
      void refetch({ cancelRefetch: false });
    }
  }, [known, held, refetch]);
  return held;
}

/**
 * The user of the token, as the pulse names it. sdash reads the token for
 * its first fetch, so a pulse that came before that names nobody; it is
 * asked for again when the data arrive, `held` turning from undefined,
 * rather than at its next turn, so that what marks the user's own comes
 * with the data.
 */
export function useUser(
  pulse: UseQueryResult<Pulse>,
  held: number | undefined,
): string | undefined {
  const user = pulse.data?.connection.user;
  const refetchPulse = pulse.refetch;
  const unnamed = pulse.data !== undefined && user === undefined;
  useEffect(() => {
    if (unnamed && held !== undefined) {
      void refetchPulse({ cancelRefetch: false });
    }
  }, [unnamed, held, refetchPulse]);
  return user;
}
