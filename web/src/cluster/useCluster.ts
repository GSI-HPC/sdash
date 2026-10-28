// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { skipToken, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation } from "react-router";

import { type DataKind, type Pulse, client } from "../client/client";
import { statusQuery } from "../client/query";
import { defineSearchParam, text } from "../routing/searchParams";
import { useSearchParam } from "../routing/useSearchParam";

/**
 * The cluster a view of cluster data shows, by the name the profile file
 * gives it. Empty, as when the address does not name one, is the first
 * cluster of the file. It is in the address, so that a link names the
 * cluster it shows (doc/adr/0035-the-jobs-view-and-its-table.md).
 */
export const clusterParam = defineSearchParam("cluster", text, "");

/** Which cluster a view of cluster data shows, or why it shows none. */
export type ClusterChoice =
  /** The status, which lists the clusters, has not arrived. */
  | { readonly kind: "pending" }
  /** The status did not arrive. */
  | { readonly kind: "failed"; readonly error: Error }
  /** The profile file names no cluster. */
  | { readonly kind: "none" }
  /** The address names a cluster the profile file does not. */
  | {
      readonly kind: "unknown";
      readonly name: string;
      readonly known: readonly string[];
    }
  /** The cluster to show, among the names of all of them. */
  | {
      readonly kind: "chosen";
      readonly name: string;
      readonly known: readonly string[];
    };

/** The cluster the address chooses, from the clusters of the status. */
export function useCluster(): ClusterChoice {
  const [named] = useSearchParam(clusterParam);
  const status = useQuery(statusQuery);

  if (status.isPending) {
    return { kind: "pending" };
  }
  if (status.isError) {
    return { kind: "failed", error: status.error };
  }
  const known = status.data.clusters.map((cluster) => cluster.name);
  const [first] = known;
  if (first === undefined) {
    return { kind: "none" };
  }
  const name = named === "" ? first : named;
  return known.includes(name)
    ? { kind: "chosen", name, known }
    : { kind: "unknown", name, known };
}

/**
 * How often a view asks for the pulse of its cluster. The data of a kind
 * change at most once in its period, 30 seconds at the least; asked three
 * times as often, a view shows a change a few seconds after sdash has it,
 * for an answer of a few hundred bytes. A view that is not visible does
 * not ask, and the kinds it asked for are fetched for two periods more
 * (doc/adr/0034-cluster-data-in-the-browser-api.md).
 */
export const pulseInterval = 10_000;

/**
 * The pulse of a cluster, asked for again every pulseInterval while the
 * page is visible: the connection, and how far each kind has got. Asking
 * keeps the kinds watched, so that sdash goes on fetching them. Without a
 * cluster nothing is asked.
 *
 * The status pill asks for the kinds of the view that shows, and the view
 * for the same kinds, so that the two share one request.
 */
export function usePulse(
  cluster: string | undefined,
  kinds: readonly DataKind[],
) {
  return useQuery({
    queryKey: ["pulse", cluster, kinds],
    queryFn:
      cluster === undefined
        ? skipToken
        : ({ signal }) => client.getPulse(cluster, kinds, { signal }),
    refetchInterval: pulseInterval,
  });
}

/**
 * The generation of a kind the pulse reports, or undefined while there is
 * no pulse or it does not report the kind.
 */
export function generationOf(
  pulse: Pulse | undefined,
  kind: DataKind,
): number | undefined {
  return pulse?.kinds.find((each) => each.kind === kind)?.generation;
}

/**
 * Gives the address of another page with the cluster the address names,
 * so that a move from one view to the next keeps showing that cluster,
 * and with the parameters given. The other parameters of the address
 * belong to the view that set them and are left behind.
 */
export function useAddressOf(): (
  path: string,
  more?: Readonly<Record<string, string>>,
) => string {
  const { search } = useLocation();
  const named = new URLSearchParams(search).get(clusterParam.name);
  return useCallback(
    (path: string, more: Readonly<Record<string, string>> = {}) => {
      const next = new URLSearchParams(
        named === null || named === "" ? {} : { [clusterParam.name]: named },
      );
      for (const [name, value] of Object.entries(more)) {
        next.set(name, value);
      }
      const query = next.toString();
      return query === "" ? path : `${path}?${query}`;
    },
    [named],
  );
}
