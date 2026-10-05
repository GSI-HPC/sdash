// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import {
  applySearchChanges,
  defineSearchParam,
  integer,
  oneOf,
  readSearchParam,
  setTo,
  text,
  writeSearchParam,
} from "./searchParams";

const state = defineSearchParam(
  "state",
  oneOf(["all", "running", "pending"]),
  "all",
);
const page = defineSearchParam("page", integer, 1);
const filter = defineSearchParam("q", text, "");

/** The query string of an address. */
function query(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe("reading a parameter", () => {
  test("gives the value the address names", () => {
    expect(readSearchParam(query("state=running"), state)).toBe("running");
    expect(readSearchParam(query("page=7"), page)).toBe(7);
    expect(readSearchParam(query("q=gpu+job"), filter)).toBe("gpu job");
  });

  test("gives the fallback when the address does not name it", () => {
    expect(readSearchParam(query(""), state)).toBe("all");
    expect(readSearchParam(query("other=1"), page)).toBe(1);
  });

  // An address is typed, pasted, cut short by a mail program and kept in
  // bookmarks across versions. Whatever stands in it, the view has to show
  // something, and never a value its code does not know.
  test.each(["state=RUNNING", "state=cancelled", "state=", "state=running%20"])(
    "gives the fallback for a word that is none of the set: %s",
    (search) => {
      expect(readSearchParam(query(search), state)).toBe("all");
    },
  );

  // One number has one spelling, so that one state has one address.
  test.each([
    "page=",
    "page=two",
    "page=1.5",
    "page=1e3",
    "page=0x10",
    "page=+3",
    "page=%203",
    "page=99999999999999999999",
  ])("gives the fallback for what is not a whole number: %s", (search) => {
    expect(readSearchParam(query(search), page)).toBe(1);
  });

  test("reads a negative number and zero", () => {
    expect(readSearchParam(query("page=-3"), page)).toBe(-3);
    expect(readSearchParam(query("page=0"), page)).toBe(0);
  });

  // A number has other spellings that a lenient reader takes: "007" for 7,
  // "-0" for 0. Read as numbers, they would be second addresses of a state
  // that has one already, and the address would keep the odd spelling for
  // as long as nothing wrote the parameter. They are the text a codec
  // gets, after the query string was decoded.
  test.each(["007", "00", "-0", "-007", "+1", " 1", "1 ", "1.0", "-", ""])(
    "takes %j for no whole number, since it is not how one is written",
    (written) => {
      expect(integer.parse(written)).toBeUndefined();
      const search = new URLSearchParams({ page: written });
      expect(readSearchParam(search, page)).toBe(page.fallback);
    },
  );

  // What is read is what would be written: every number has the one
  // spelling that format gives it.
  test.each([0, 7, -3, 10, 100, -120, Number.MAX_SAFE_INTEGER])(
    "reads %d in the spelling it is written in, and in no other",
    (value) => {
      const written = integer.format(value);

      expect(integer.parse(written)).toBe(value);
      expect(integer.parse(`0${written}`)).toBeUndefined();
      expect(integer.parse(`+${written}`)).toBeUndefined();
    },
  );

  // The first is what URLSearchParams.get gives, and what a server would
  // read too.
  test("takes the first when the address names it twice", () => {
    expect(readSearchParam(query("state=pending&state=running"), state)).toBe(
      "pending",
    );
  });
});

describe("writing a parameter", () => {
  test("puts the value into the query string", () => {
    expect(writeSearchParam(query(""), state, "running").toString()).toBe(
      "state=running",
    );
    expect(writeSearchParam(query(""), page, 3).toString()).toBe("page=3");
  });

  // Other parameters belong to other controls of the same view, or to the
  // shell. Setting one filter must not drop the rest.
  test("keeps every other parameter", () => {
    expect(
      writeSearchParam(query("q=gpu&page=2"), state, "pending").toString(),
    ).toBe("q=gpu&page=2&state=pending");
  });

  test("replaces the value that was there", () => {
    expect(writeSearchParam(query("page=2&q=gpu"), page, 5).toString()).toBe(
      "page=5&q=gpu",
    );
  });

  // A view in its plain state has the plain address: there is one address
  // for one state, and a link to the Jobs view does not differ depending
  // on which filters were touched and reset before it was copied.
  test("leaves the fallback out of the address", () => {
    expect(
      writeSearchParam(query("state=running"), state, "all").toString(),
    ).toBe("");
    expect(writeSearchParam(query("q=gpu&page=4"), page, 1).toString()).toBe(
      "q=gpu",
    );
  });

  // The router hands out the query string it holds. Changing that object
  // would change the address behind the router's back.
  test("does not change the query string it is given", () => {
    const before = query("page=2");

    writeSearchParam(before, page, 9);

    expect(before.toString()).toBe("page=2");
  });

  test("writes text so that reading gives it back", () => {
    const written = writeSearchParam(query(""), filter, "a&b=c d/é");

    expect(readSearchParam(query(written.toString()), filter)).toBe(
      "a&b=c d/é",
    );
  });
});

// One event that changes two parameters, a filter that also puts the list
// back on its first page, has to end as one address and one entry in the
// history.
describe("several changes to a query string", () => {
  test("are all in the result", () => {
    const changed = applySearchChanges(query("q=gpu&page=4"), [
      setTo(state, "running"),
      setTo(page, 2),
    ]);

    expect(changed.toString()).toBe("q=gpu&page=2&state=running");
  });

  // Each change is made to what the one before it returned: the second
  // must not start again from the query string as it was.
  test("build on each other, the later one having the last word", () => {
    const changed = applySearchChanges(query(""), [
      setTo(state, "pending"),
      setTo(page, 3),
      setTo(state, "running"),
    ]);

    expect(changed.toString()).toBe("state=running&page=3");
  });

  test("leave a parameter out that is set to its fallback", () => {
    const changed = applySearchChanges(query("state=running&page=4"), [
      setTo(state, "pending"),
      setTo(page, 1),
    ]);

    expect(changed.toString()).toBe("state=pending");
  });

  test("do not change the query string they are given", () => {
    const before = query("page=2");

    applySearchChanges(before, [setTo(page, 9), setTo(state, "running")]);

    expect(before.toString()).toBe("page=2");
  });
});
