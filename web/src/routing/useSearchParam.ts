// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { startTransition, useOptimistic } from "react";
import { useSearchParams } from "react-router";

import {
  applySearchChanges,
  readSearchParam,
  type SearchChange,
  type SearchParam,
  setTo,
} from "./searchParams";

/** How a change of a parameter is entered in the browser's history. */
export interface SetOptions {
  /**
   * "replace", the default, changes the current entry: Back then leaves the
   * view, and typing into a filter does not fill the history. "push" adds
   * an entry, for a change the user would want to go back from, such as
   * opening a drawer.
   */
  history?: "replace" | "push";
}

/**
 * A function that makes several changes to the query string in one
 * navigation, and so in one entry of the history:
 *
 *     const changeSearch = useSearchChanges();
 *     changeSearch([setTo(state, "running"), setTo(page, 1)]);
 *
 * It is how one event sets two parameters, a filter that also puts the
 * list back on its first page, say. Two setters of useSearchParam called
 * in one event do not add up: the router hands each the query string it
 * last rendered, not the one the call before it asked for, so the second
 * navigation would undo the first.
 */
export function useSearchChanges(): (
  changes: readonly SearchChange[],
  options?: SetOptions,
) => void {
  const [, setSearch] = useSearchParams();

  return (changes, options = {}) => {
    setSearch((current) => applySearchChanges(current, changes), {
      replace: options.history !== "push",
    });
  };
}

/**
 * One parameter of the address's query string as state: its value, and a
 * function that sets it. The value is read from the address on every
 * render, so Back, Forward and a pasted link change it like a click does.
 *
 * The setter is for a control that changes this one parameter. Where one
 * event changes two, call neither setter and use useSearchChanges, which
 * says why.
 */
export function useSearchParam<Value>(
  param: SearchParam<Value>,
): [Value, (value: Value, options?: SetOptions) => void] {
  const [search] = useSearchParams();
  const changeSearch = useSearchChanges();

  function set(value: Value, options?: SetOptions) {
    changeSearch([setTo(param, value)], options);
  }

  return [readSearchParam(search, param), set];
}

/**
 * The text of a field whose value is a parameter of the query string, and
 * the function its changes go to: `write` is called with each text typed,
 * and puts it into the address.
 *
 * The router changes the address in a transition, so the address lags
 * behind a user who types fast. A field that showed the address's text
 * would be put back to that text after each key, and the next key would
 * be added to it, losing the one before. The field shows the text typed
 * until the address has it, as an optimistic state of the transition; a
 * change of the address that the field did not make, Back or a button
 * that clears the filters, shows at once.
 */
export function useTypedText(
  value: string,
  write: (text: string) => void,
): [string, (text: string) => void] {
  const [shown, show] = useOptimistic(value);

  function type(text: string) {
    startTransition(() => {
      show(text);
      write(text);
    });
  }

  return [shown, type];
}
