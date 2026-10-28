// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

/** How often the age is written anew. */
const tick = 5_000;

/**
 * How long ago something happened, in words: "just now" within ten
 * seconds, then in seconds, minutes and hours.
 */
export function ageOf(then: Date, now: Date): string {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - then.getTime()) / 1000),
  );
  if (seconds < 10) {
    return "just now";
  }
  if (seconds < 60) {
    return `${String(seconds)} s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${String(minutes)} minutes ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${String(hours)} hours ago`;
}

/**
 * Says how old the data a view shows are: when sdash fetched them from
 * slurmrestd, which is up to a period before the view asked
 * (doc/adr/0010-read-through-cache-and-polling.md). The words are written
 * anew every few seconds; the time itself is in the element, for whoever
 * wants it exact.
 *
 * It is no live region: an age that changes every few seconds would be
 * read out every few seconds.
 */
export function DataAge({ fetchedAt }: { fetchedAt: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, tick);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const then = new Date(fetchedAt);

  return (
    <time dateTime={fetchedAt}>
      {`fetched ${ageOf(then, now)}, at ${then.toLocaleTimeString("en-GB")}`}
    </time>
  );
}
