// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// How the Jobs view writes what a job holds: its times as Slurm's tools
// write them, and the tone of its state. Nothing here renders.

import type { Job } from "../../client/client";
import type { BadgeTone } from "../../primitives/Badge";

/**
 * A length of time as squeue and sacct write it: hours, minutes and
 * seconds, and the days in front where there are any, "1-02:03:04".
 */
export function duration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const days = Math.floor(whole / 86_400);
  const clock = [
    Math.floor(whole / 3600) % 24,
    Math.floor(whole / 60) % 60,
    whole % 60,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${String(days)}-${clock}` : clock;
}

/** The states in which a job runs, or has run and still holds its nodes. */
const running = new Set(["RUNNING", "SUSPENDED"]);

/**
 * How long a job has run, in seconds, at the moment `at`: since its start
 * while it runs, from its start to its end once it has ended, and 0 before
 * it starts. slurmctld gives a running job the end it expects, its start
 * and its limit, so the end of a job counts only once it has ended.
 */
export function elapsed(job: Job, at: Date): number {
  if (job.startTime === undefined || job.state === "PENDING") {
    return 0;
  }
  const start = Date.parse(job.startTime);
  const end =
    running.has(job.state) || job.endTime === undefined
      ? at.getTime()
      : Date.parse(job.endTime);
  return Math.max(0, (end - start) / 1000);
}

/** The time limit of a job, or that it has none. */
export function limit(job: Job): string {
  return job.timeLimit === undefined
    ? "no limit"
    : duration(job.timeLimit * 60);
}

/**
 * The tone of a state, after the handoff's: running is fine, pending
 * waits, what ended by itself is information, what failed is an error,
 * what ran out of time is orange and what was suspended violet. A state
 * the handoff does not name, or that Slurm adds, is neutral.
 */
export function toneOf(state: string): BadgeTone {
  switch (state) {
    case "RUNNING":
      return "ok";
    case "PENDING":
      return "warn";
    case "COMPLETED":
    case "COMPLETING":
      return "info";
    case "SUSPENDED":
      return "vio";
    case "FAILED":
    case "NODE_FAIL":
    case "BOOT_FAIL":
    case "OUT_OF_MEMORY":
    case "DEADLINE":
      return "err";
    case "TIMEOUT":
      return "org";
    default:
      return "neutral";
  }
}

/** A state as a word of a sentence: "Running" for RUNNING, "Out of memory" for OUT_OF_MEMORY. */
export function wordOf(state: string): string {
  const words = state.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
