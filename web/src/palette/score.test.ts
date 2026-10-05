// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import { rank, score, type Searchable } from "./score";

function item(label: string, ...keywords: string[]): Searchable {
  return { label, keywords };
}

/** The labels a query finds, best first. */
function found(query: string, ...items: Searchable[]): string[] {
  return rank(query, items).map(({ label }) => label);
}

describe("how a query matches a label", () => {
  // The three ways, each better than the next. What a user types first is
  // the start of the name they have in mind.
  test("the start of the label is best, then its inside, then letters in order", () => {
    expect(
      found(
        "st",
        item("Submit job"), // S-u-b-m-i-T: in order, with others between
        item("Job history"), // inside
        item("Statistics"), // at the start
      ),
    ).toEqual(["Statistics", "Job history", "Submit job"]);
  });

  test("a label that holds none of it is not found", () => {
    expect(score("zz", item("Nodes"))).toBe(0);
    expect(found("zz", item("Nodes"), item("Jobs"))).toEqual([]);
  });

  // The letters of a query have to come in its order.
  test("the letters out of order are not found", () => {
    expect(score("sdon", item("Nodes"))).toBe(0);
  });

  test("case and space around the query do not count", () => {
    expect(score("  JOBS ", item("Jobs"))).toBe(score("jobs", item("Jobs")));
    expect(score("  JOBS ", item("Jobs"))).toBeGreaterThan(0);
  });

  // "job" is closer to "Jobs" than to "Job history".
  test("of two labels that start with the query the shorter is better", () => {
    expect(found("job", item("Job history"), item("Jobs"))).toEqual([
      "Jobs",
      "Job history",
    ]);
  });

  test("of two labels that hold the query the earlier match is better", () => {
    expect(
      found("conf", item("The cluster's conf"), item("slurm.conf")),
    ).toEqual(["slurm.conf", "The cluster's conf"]);
  });

  test("of two labels with the letters in order the closer letters are better", () => {
    expect(found("ae", item("Accounts & users"), item("API explorer"))).toEqual(
      ["API explorer", "Accounts & users"],
    );
  });
});

describe("how a query matches keywords", () => {
  // A keyword is a word the user may know the thing by and the label does
  // not hold: "queue" for Jobs.
  test("an entry is found by a keyword", () => {
    expect(found("queue", item("Jobs", "queue"), item("Nodes"))).toEqual([
      "Jobs",
    ]);
  });

  test("the label counts for more than a keyword matched the same way", () => {
    expect(
      found("part", item("Queues", "partitions"), item("Partitions")),
    ).toEqual(["Partitions", "Queues"]);
  });

  // What the user sees in the list is why they think an entry was found.
  // An entry whose label holds the query comes before one found by a word
  // they cannot see, however well that word matches.
  test("the inside of a label counts for more than the start of a keyword", () => {
    expect(
      found("conf", item("Settings", "configuration"), item("slurm.conf")),
    ).toEqual(["slurm.conf", "Settings"]);
  });

  test("the start of a keyword counts for more than its inside", () => {
    expect(
      found("que", item("Nodes", "squeue"), item("Jobs", "queue")),
    ).toEqual(["Jobs", "Nodes"]);
  });

  // The letters of the query scattered over a label are the weakest sign
  // that the entry is meant.
  test("a keyword that holds the query counts for more than scattered letters in a label", () => {
    expect(
      found("ae", item("API explorer"), item("Reservations", "maenad")),
    ).toEqual(["Reservations", "API explorer"]);
  });

  // The user cannot see the keywords. Letters scattered over one would
  // find an entry for no reason they could work out.
  test("letters in order are not looked for in a keyword", () => {
    expect(score("ae", item("Jobs", "API explorer"))).toBe(0);
  });
});

describe("the order of what is found", () => {
  // Without a query nothing is better than anything else, and the list is
  // shown as it was handed in: the views as the navigation has them.
  test("is the order handed in while there is no query", () => {
    const items = [item("Overview"), item("Nodes"), item("Jobs")];

    expect(rank("", items)).toEqual(items);
    expect(rank("   ", items)).toEqual(items);
  });

  test("is the order handed in among entries that match equally", () => {
    expect(found("s", item("Aas"), item("Bbs"), item("Ccs"))).toEqual([
      "Aas",
      "Bbs",
      "Ccs",
    ]);
  });
});
