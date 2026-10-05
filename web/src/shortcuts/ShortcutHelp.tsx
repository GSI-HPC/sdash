// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useContext, useId } from "react";

import { Modal, ModalClose, ModalTitle } from "../overlay/Modal";
import { SettingsContext } from "./context";
import { helpGroups } from "./help";
import { isCharacterKey, spokenKeys } from "./keys";
import { Keys } from "./Keys";
import type { Listed } from "./registry";
import { useRegisteredShortcuts } from "./useShortcuts";

/**
 * The dialog that lists the keyboard shortcuts. The list is the registry's
 * and not a text kept beside it: what is registered at this moment is what
 * is shown, so a shortcut cannot exist without being listed, or be listed
 * without existing (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
 *
 * Below the list is the switch for the shortcuts that are typed with
 * character keys alone, which WCAG 2.1 asks to be there (success
 * criterion 2.1.4).
 */
export function ShortcutHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      className="top-[12vh] max-h-[76vh] w-160"
    >
      <Help />
    </Modal>
  );
}

function Help() {
  const groups = helpGroups(useRegisteredShortcuts());
  const { characterKeys, setCharacterKeys } = useContext(SettingsContext);
  const id = useId();
  const aboutSwitchId = `${id}-about-switch`;

  return (
    // One region that scrolls, around everything: the list can be longer
    // than the window is high. The controls inside it take the focus, and
    // the keys that scroll then work from there, so the region needs no
    // place of its own in the order of the Tab key.
    <div className="min-h-0 overflow-auto">
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-bd bg-surface py-3 pr-3.5 pl-5">
        <ModalTitle className="text-base font-semibold">
          Keyboard shortcuts
        </ModalTitle>
        <ModalClose className="h-7.5 cursor-pointer rounded-[5px] border border-bd bg-surface px-3 text-xs hover:bg-hover">
          Close
        </ModalClose>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {groups.map(({ group, shortcuts }, position) => (
          // The id is made from the position: a heading such as "Go to"
          // has a space in it, and an id must not.
          <section key={group} aria-labelledby={`${id}-${String(position)}`}>
            <h3
              id={`${id}-${String(position)}`}
              className="pb-1 text-[0.6875rem] font-medium tracking-[0.02em] text-t3"
            >
              {group}
            </h3>
            <dl className="gap-x-8 sm:columns-2">
              {shortcuts.map((shortcut) => (
                <Row
                  key={shortcut.id}
                  shortcut={shortcut}
                  characterKeys={characterKeys}
                />
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className="border-t border-bds px-5 py-3.5">
        <label className="flex w-fit cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={characterKeys}
            aria-describedby={aboutSwitchId}
            onChange={(event) => {
              setCharacterKeys(event.target.checked);
            }}
            className="size-3.5 cursor-pointer accent-ac-l"
          />
          Single-key shortcuts
        </label>
        <p id={aboutSwitchId} className="mt-1 text-[0.78125rem] text-t2">
          The shortcuts that need no Ctrl or Command key. Switch them off if
          speech input, or a hand resting on the keyboard, sets them off by
          accident. The others keep working, and the command palette offers
          everything they do.
        </p>
      </div>
    </div>
  );
}

/**
 * One shortcut: what it does and its keys, as caps for the eye and in
 * words for a screen reader. A shortcut that is switched off stays in the
 * list and says so.
 */
function Row({
  shortcut,
  characterKeys,
}: {
  shortcut: Listed;
  characterKeys: boolean;
}) {
  const { apple } = useContext(SettingsContext);
  const off = !characterKeys && isCharacterKey(shortcut.binding);

  return (
    <div className="flex break-inside-avoid items-center justify-between gap-4 py-1">
      <dt>{shortcut.description}</dt>
      <dd className="flex shrink-0 items-center gap-2 text-t2">
        {off && <span className="text-[0.6875rem]">switched off</span>}
        <span className="sr-only">{spokenKeys(shortcut.binding, apple)}</span>
        <Keys keys={shortcut.keys} always />
      </dd>
    </div>
  );
}
