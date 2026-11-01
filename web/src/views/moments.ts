// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// How the views of cluster data write a moment: a weekday, a date and a
// time of day, in the browser's time zone. Nothing here renders.

// The parts are written apart and put together here: with a year, en-GB
// puts a comma after the weekday as well.
const day = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A moment as "Thu 15 Jan, 14:00", with the year where it is not the year
 * of `now`, "Thu 15 Jan 2027, 14:00"; `none` when there is no moment.
 */
export function timeOf(
  time: string | undefined,
  none: string,
  now: Date,
): string {
  if (time === undefined) {
    return none;
  }
  const at = new Date(time);
  const year =
    at.getFullYear() === now.getFullYear()
      ? ""
      : ` ${String(at.getFullYear())}`;
  return `${day.format(at)}${year}, ${clock.format(at)}`;
}
