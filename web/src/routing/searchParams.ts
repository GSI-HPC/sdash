// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// State that lives in the query string of the address: a filter, a sort
// order, the drawer that is open. A view keeps such state there and not in
// a component, so that a reload, a bookmark and a link sent to a colleague
// show the same thing (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
//
// A parameter is defined once, with its name, how its text is read and
// what it is when the address does not say. This module is the part that
// needs no router and no page; useSearchParam.ts is the hook on top of it.

/** How a parameter's value is read from the address and written to it. */
export interface Codec<Value> {
  /**
   * Reads the text of the address. Undefined when the text is no value of
   * this parameter: an address is typed, pasted and cut short, so what
   * stands there is checked and never trusted.
   */
  readonly parse: (text: string) => Value | undefined;
  /** Writes a value as text. */
  readonly format: (value: Value) => string;
}

/** One parameter of the query string. */
export interface SearchParam<Value> extends Codec<Value> {
  /** The name of the parameter in the address. */
  readonly name: string;
  /**
   * The value when the address does not name the parameter, or names it
   * with a text that cannot be read.
   */
  readonly fallback: Value;
}

/** Defines a parameter. */
export function defineSearchParam<Value>(
  name: string,
  codec: Codec<Value>,
  fallback: Value,
): SearchParam<Value> {
  return { name, ...codec, fallback };
}

/** The value of a parameter in a query string. */
export function readSearchParam<Value>(
  search: URLSearchParams,
  param: SearchParam<Value>,
): Value {
  const text = search.get(param.name);
  if (text === null) {
    return param.fallback;
  }
  return param.parse(text) ?? param.fallback;
}

/**
 * A query string with a parameter set to a value; the one handed in is not
 * changed, and every other parameter is kept. A value that is the fallback
 * is not written: the address of a view in its plain state is then the
 * plain address, and there is one address for one state.
 */
export function writeSearchParam<Value>(
  search: URLSearchParams,
  param: SearchParam<Value>,
  value: Value,
): URLSearchParams {
  const next = new URLSearchParams(search);
  const text = param.format(value);
  if (text === param.format(param.fallback)) {
    next.delete(param.name);
  } else {
    next.set(param.name, text);
  }
  return next;
}

/**
 * One change to a query string: a function from the query string as it is
 * to the one with the change made. Changes are applied one after the
 * other, each to what the one before it returned.
 */
export type SearchChange = (search: URLSearchParams) => URLSearchParams;

/** The change that sets a parameter to a value. */
export function setTo<Value>(
  param: SearchParam<Value>,
  value: Value,
): SearchChange {
  return (search) => writeSearchParam(search, param, value);
}

/** A query string with several changes made, in the order given. */
export function applySearchChanges(
  search: URLSearchParams,
  changes: readonly SearchChange[],
): URLSearchParams {
  return changes.reduce((changed, change) => change(changed), search);
}

/** Any text, as it stands. */
export const text: Codec<string> = {
  parse: (written) => written,
  format: (value) => value,
};

/**
 * A whole number in the one spelling it has: digits, with a minus in front
 * of a negative one, and nothing else. "1e3", "0x10" and "12 " are not read
 * as numbers, and neither are "007", "+7" and "-0", which format never
 * writes: two spellings of one value would be two addresses of one state.
 */
export const integer: Codec<number> = {
  parse(written) {
    if (!/^(?:0|-?[1-9]\d*)$/.test(written)) {
      return undefined;
    }
    const value = Number(written);
    return Number.isSafeInteger(value) ? value : undefined;
  },
  format: (value) => String(value),
};

/** One of a fixed set of words, such as the states a list is filtered by. */
export function oneOf<const Word extends string>(
  words: readonly Word[],
): Codec<Word> {
  return {
    parse: (written) => words.find((word) => word === written),
    format: (value) => value,
  };
}
