// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// How the command palette decides what a query finds and in which order.
// The list is a few dozen entries with names the user knows, so the
// scoring is small on purpose: three ways for a text to match, at its
// start, inside it, or as scattered letters, each better than the next,
// and no weights to tune.

/** What can be looked for: a label, and words that also find it. */
export interface Searchable {
  readonly label: string;
  readonly keywords: readonly string[];
}

/** A query or a text as it is compared: case and outer space do not count. */
function normalise(text: string): string {
  return text.trim().toLowerCase();
}

// The best score of each way to match, from the best way down. A better
// way always beats a worse one, whatever the details inside it: the
// details move a score by less than the distance between two ways.
const ways = {
  // The label starts with the query.
  labelStart: 5000,
  // The label holds the query somewhere.
  labelInside: 4000,
  // A keyword starts with the query, or holds it.
  keywordStart: 3000,
  keywordInside: 2000,
  // The label holds the letters of the query in order, with others
  // between them.
  labelScattered: 1000,
} as const;

// The most the details can take off a score.
const detail = 400;

/**
 * How far apart the first and the last character of the query lie in the
 * text when its characters are found in order, or -1 when they are not.
 */
function scatteredSpan(query: string, text: string): number {
  let from = 0;
  let first = -1;
  let last = -1;
  for (const character of query) {
    const at = text.indexOf(character, from);
    if (at < 0) {
      return -1;
    }
    if (first < 0) {
      first = at;
    }
    last = at;
    from = at + 1;
  }
  return last - first + 1;
}

/**
 * How well a query matches one text that holds it as it stands; zero when
 * the text does not. A match at the start is better than one inside, and
 * among those the shorter text and the earlier match are better: "Jobs"
 * before "Job history" for "job". Query and text are normalised.
 */
function scoreHeld(query: string, text: string, start: number, inside: number) {
  const at = text.indexOf(query);
  if (at === 0) {
    return start - Math.min(text.length, detail);
  }
  return at > 0 ? inside - Math.min(at, detail) : 0;
}

/**
 * How well a query matches an entry; zero when it does not. An empty query
 * matches every entry equally, so the list then keeps its own order.
 *
 * What the user can see counts for most: the query at the start of the
 * label, then inside it. A keyword that holds the query comes next. Last
 * are the letters of the query scattered over the label in order, the
 * closer together the better, which finds "API explorer" for "apx". A
 * keyword is not searched that way: letters scattered over a word the user
 * cannot see would find entries for no reason they could work out.
 */
export function score(query: string, item: Searchable): number {
  const wanted = normalise(query);
  if (wanted === "") {
    return 1;
  }
  const label = normalise(item.label);
  const span = scatteredSpan(wanted, label);
  return Math.max(
    0,
    scoreHeld(wanted, label, ways.labelStart, ways.labelInside),
    ...item.keywords.map((keyword) =>
      scoreHeld(
        wanted,
        normalise(keyword),
        ways.keywordStart,
        ways.keywordInside,
      ),
    ),
    span > 0 ? ways.labelScattered - Math.min(span, detail) : 0,
  );
}

/**
 * The entries a query finds, best first. Entries that score the same keep
 * the order they came in.
 */
export function rank<Item extends Searchable>(
  query: string,
  items: readonly Item[],
): Item[] {
  return items
    .map((item) => ({ item, points: score(query, item) }))
    .filter(({ points }) => points > 0)
    .sort((one, other) => other.points - one.points)
    .map(({ item }) => item);
}
