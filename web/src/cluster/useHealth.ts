// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useLocation } from "react-router";

import type { Pulse } from "../client/client";
import { viewAt } from "../routing/views";
import { type Health, healthOf } from "./health";
import { type ClusterChoice, useCluster, usePulse } from "./useCluster";

/** The cluster the page shows, its state, and its pulse where it has one. */
export interface ClusterHealth {
  readonly choice: ClusterChoice;
  readonly health: Health;
  readonly pulse: Pulse | undefined;
}

/**
 * The state of the cluster the page shows, for the header. It asks for
 * the pulse of the kinds the view that shows asks for, and so shares its
 * request (`usePulse`): the state is that of the data on the screen, and
 * a view that shows none of a cluster's data asks for the connection
 * alone.
 */
export function useHealth(): ClusterHealth {
  const choice = useCluster();
  const { pathname } = useLocation();
  const kinds = viewAt(pathname)?.kinds ?? [];
  const pulse = usePulse(
    choice.kind === "chosen" ? choice.name : undefined,
    kinds,
  );

  switch (choice.kind) {
    case "pending":
      return {
        choice,
        pulse: undefined,
        health: {
          tone: "neutral",
          word: "Starting",
          text: "sdash has not said which clusters it serves yet.",
        },
      };
    case "failed":
      return {
        choice,
        pulse: undefined,
        health: {
          tone: "err",
          word: "Offline",
          text: "sdash does not answer.",
        },
      };
    case "none":
      return {
        choice,
        pulse: undefined,
        health: {
          tone: "neutral",
          word: "No cluster",
          text: "The profile file names no cluster.",
        },
      };
    case "unknown":
      return {
        choice,
        pulse: undefined,
        health: {
          tone: "err",
          word: "Unknown",
          text: `The profile file names no cluster ${choice.name}.`,
        },
      };
    case "chosen":
      break;
  }
  if (pulse.isError) {
    return {
      choice,
      pulse: undefined,
      health: { tone: "err", word: "Offline", text: "sdash does not answer." },
    };
  }
  if (pulse.data === undefined) {
    return {
      choice,
      pulse: undefined,
      health: {
        tone: "neutral",
        word: "Connecting",
        text: "sdash is connecting to slurmrestd.",
      },
    };
  }
  return { choice, pulse: pulse.data, health: healthOf(pulse.data) };
}
