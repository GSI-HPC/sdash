// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { failureOf } from "../cluster/failure";
import type { Pulse } from "../client/client";
import { Banner } from "../primitives/Banner";
import { ErrorPanel } from "../primitives/ErrorPanel";
import type { HeadingLevel } from "../primitives/Heading";
import { Skeleton } from "../primitives/Skeleton";

/** The body of an error, as an answer of the API holds one. */
type ErrorBody = NonNullable<Pulse["connection"]["error"]>;

/**
 * What stands in a card in place of data that have not come: why, where
 * the read failed, with a button that asks again, and the place of the
 * data while they are on their way.
 */
export function Unready({
  error,
  what,
  level,
  lines = 4,
  onRetry,
  className,
}: {
  /** The failure of the read, if it failed. */
  error: Error | null;
  /** What is on its way, as in "Loading the nodes". */
  what: string;
  /** The level of the heading of a failure. */
  level: HeadingLevel;
  lines?: number;
  onRetry: () => void;
  className?: string;
}) {
  if (error === null) {
    return (
      <Skeleton
        label={`Loading ${what}`}
        lines={lines}
        {...(className === undefined ? {} : { className })}
      />
    );
  }
  const failed = failureOf(error);
  return (
    <ErrorPanel
      title={failed.title}
      level={level}
      {...(failed.code === undefined ? {} : { code: failed.code })}
      onRetry={onRetry}
      {...(className === undefined ? {} : { className })}
    >
      {failed.text}
    </ErrorPanel>
  );
}

/**
 * The banner above data that are older than a fetch that failed since,
 * which says why and that the data shown may be out of date.
 */
export function Stale({
  error,
  what,
}: {
  /** The failure of the last fetch, if it failed. */
  error: ErrorBody | undefined;
  /** What is shown, as in "The nodes shown". */
  what: string;
}) {
  if (error === undefined) {
    return null;
  }
  const stale = failureOf(error);
  return (
    <Banner
      tone="warn"
      title={stale.title}
      {...(stale.code === undefined ? {} : { code: stale.code })}
    >
      {`${what} are those sdash fetched last, and may be out of date. ${stale.text}`}
    </Banner>
  );
}
