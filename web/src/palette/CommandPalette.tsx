// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Icon } from "../icons/Icon";
import { Modal, ModalClose, ModalTitle } from "../overlay/Modal";
import { Keys } from "../shortcuts/Keys";
import { kindHeadings, type PaletteItem, search } from "./items";

/**
 * The command palette: a dialog with one text field, and below it the
 * views and actions that match what is typed there
 * (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
 *
 * To assistive technology it is a combobox with a list box
 * (doc/adr/0014-accessibility-and-browsers.md). The focus never leaves the
 * text field: the arrow keys, Home and End move a marker through the list,
 * which the field reports as its active descendant, and Enter chooses the
 * marked entry. The pointer does the same by moving and clicking.
 */
export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly PaletteItem[];
}) {
  return (
    // No higher than the window leaves room for: in a low window, which is
    // what a page enlarged to twice its size is, the list gets what is
    // left between the text field and the footer and scrolls inside that.
    // A palette that ran past the bottom edge could not be scrolled to,
    // and its marker would leave the screen on the way down the list.
    <Modal
      open={open}
      onClose={onClose}
      className="top-[12vh] max-h-[76vh] w-150"
    >
      <Palette items={items} onClose={onClose} />
    </Modal>
  );
}

/**
 * The content of the palette. It is mounted when the dialog opens, so the
 * query and the marker start afresh each time.
 */
function Palette({
  items,
  onClose,
}: {
  items: readonly PaletteItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // The entry the user moved the marker to. Until they do, and again after
  // each change of the query, the marker is on the first entry.
  const [markedId, setMarkedId] = useState<string | null>(null);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (item: PaletteItem) => `${id}-option-${item.id}`;

  const groups = search(query, items);
  const found = groups.flatMap((group) => group.items);
  const marked = found.find((item) => item.id === markedId) ?? found[0];

  // The marked entry is scrolled into view when the keyboard moved the
  // marker, by an arrow key or by typing, which puts it back on the first
  // entry. It is not when the pointer did: the entry under the pointer is
  // in view already, in part at least, and a list that moved to show the
  // rest of it would slide away under the pointer and mark the next one.
  const markedBy = useRef<"keyboard" | "pointer">("keyboard");
  const markedElement = useRef<HTMLDivElement>(null);
  const markedOptionId = marked ? optionId(marked) : undefined;
  useEffect(() => {
    if (markedBy.current === "keyboard") {
      markedElement.current?.scrollIntoView({ block: "nearest" });
    }
  }, [markedOptionId]);

  function choose(item: PaletteItem) {
    // Closed first: an entry may open another dialog, which then has to be
    // the last word on what is open.
    onClose();
    item.run();
  }

  function onKeyDown(event: KeyboardEvent) {
    // Enter may end the composition of a character, as in Japanese, and
    // then belongs to the text and not to the list.
    if (event.nativeEvent.isComposing) {
      return;
    }
    const at = marked ? found.indexOf(marked) : -1;
    const last = found.length - 1;
    const target = {
      ArrowDown: at >= last ? 0 : at + 1,
      ArrowUp: at <= 0 ? last : at - 1,
      Home: 0,
      End: last,
    }[event.key];

    if (target !== undefined) {
      event.preventDefault();
      markedBy.current = "keyboard";
      setMarkedId(found[target]?.id ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (marked) {
        choose(marked);
      }
    }
  }

  return (
    <>
      <ModalTitle className="sr-only">Command palette</ModalTitle>
      {/*
        The ring of the keyboard focus is drawn around the whole row and
        not around the bare text field inside it, which has no border to
        carry one.
      */}
      <div className="flex items-center gap-2.5 border-b border-bd px-3.5 py-3 text-t3 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-focus">
        <Icon name="search" className="size-4 stroke-2" />
        <input
          type="text"
          role="combobox"
          aria-label="Search views and actions"
          aria-autocomplete="list"
          aria-expanded={found.length > 0}
          aria-controls={found.length > 0 ? listId : undefined}
          aria-activedescendant={markedOptionId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Go to a view or run an action"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            markedBy.current = "keyboard";
            setMarkedId(null);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-t1 outline-none placeholder:text-t3"
        />
        {/*
          The button shows the key that does the same, and nothing else.
          Its name starts with what it shows and goes on, for assistive
          technology, to say what it does: "Esc to close".
        */}
        <ModalClose className="cursor-pointer rounded-[3px] hover:text-t1">
          <Keys keys="Escape" named />
          <span className="sr-only"> to close</span>
        </ModalClose>
      </div>

      {found.length > 0 ? (
        // The pointer must not take the focus out of the text field, or
        // the keys would stop working after a click that chose nothing.
        <div
          id={listId}
          role="listbox"
          aria-label="Views and actions"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          className="max-h-95 min-h-0 overflow-auto p-1.5"
        >
          {groups.map((group) => (
            <div
              key={group.kind}
              role="group"
              aria-labelledby={`${id}-${group.kind}`}
            >
              <div
                id={`${id}-${group.kind}`}
                className="px-2.5 pt-2 pb-1 text-[0.65625rem] font-semibold tracking-[0.05em] text-t3 uppercase"
              >
                {kindHeadings[group.kind]}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  id={optionId(item)}
                  ref={item === marked ? markedElement : undefined}
                  role="option"
                  aria-selected={item === marked}
                  tabIndex={-1}
                  onPointerMove={() => {
                    markedBy.current = "pointer";
                    setMarkedId(item.id);
                  }}
                  onClick={() => {
                    choose(item);
                  }}
                  // The keyboard reaches an entry through the text field.
                  // Should the focus land on one all the same, as some
                  // assistive technology moves it, Enter still chooses.
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      choose(item);
                    }
                  }}
                  // The marker is a background colour, and a contrast
                  // theme of the system replaces every background: there
                  // it is an outline, in the colour the system picks.
                  //
                  // The scroll margin is the padding of the list: the
                  // marker keeps that distance from the edge it is
                  // scrolled to, where it would otherwise sit flush and
                  // lose a fraction of a pixel to rounding.
                  className={`flex cursor-pointer scroll-my-1.5 items-center gap-2.5 rounded-[5px] px-2.5 py-2 ${
                    item === marked
                      ? "bg-hover forced-colors:outline-2 forced-colors:-outline-offset-2"
                      : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.label}
                  </span>
                  {item.keys && (
                    <span className="text-t2">
                      <Keys keys={item.keys} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {/*
        Always in the page, so that a screen reader announces what a
        change of the query found; a region that arrives together with
        its text is often not read. It is seen only when nothing matches.
      */}
      <p
        role="status"
        className={found.length > 0 ? "sr-only" : "p-5 text-center text-t3"}
      >
        {found.length === 0
          ? "No view or action matches."
          : found.length === 1
            ? "1 match"
            : `${String(found.length)} matches`}
      </p>

      <p className="border-t border-bds px-3.5 py-2 text-[0.71875rem] text-t3">
        The arrow keys move through the list, Enter chooses, Escape closes.
      </p>
    </>
  );
}
