// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createPath, useLocation, useNavigate } from "react-router";

import { galleryPath } from "../gallery/page";
import { CommandPalette } from "../palette/CommandPalette";
import { PopupContainer } from "../primitives/popups";
import { SettingsContext } from "../shortcuts/context";
import { ShortcutHelp } from "../shortcuts/ShortcutHelp";
import { ShortcutScope } from "../shortcuts/ShortcutScope";
import { useShortcuts } from "../shortcuts/useShortcuts";
import { leadsTo } from "../routing/views";
import { readStored, store } from "../storage/local";
import { toggleTheme } from "../theme/theme";
import { useTheme } from "../theme/useTheme";
import {
  type ShellActions,
  shellPaletteItems,
  shellShortcuts,
  type ShellState,
} from "./commands";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { narrowScreen, startsCollapsed, storageKey, stored } from "./sidebar";
import { SkipLink } from "./SkipLink";
import { useKeyboardScroll } from "./useKeyboardScroll";
import { useMediaQuery } from "./useMediaQuery";

/** The id of the main region, which the skip link points to. */
const mainId = "main";

/** A dialog of the shell, and the address it was opened over. */
interface OpenDialog {
  readonly kind: "palette" | "help";
  readonly at: string;
}

/**
 * The shell of the application: what is on the screen whichever view
 * shows. The header lies across the top, the sidebar with the navigation
 * down the left, and the view, handed in as children, in the main region,
 * the only part that scrolls. The sizes are the design handoff's
 * (doc/design/README.md, "Global layout"; doc/ui.md).
 *
 * The shell also owns what belongs to no view: whether the sidebar is
 * collapsed, which dialog is open, and the shortcuts that work everywhere.
 */
export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const theme = useTheme();
  const { characterKeys, setCharacterKeys } = useContext(SettingsContext);

  const [collapsed, setCollapsed] = useState(() =>
    startsCollapsed(readStored(storageKey)),
  );
  // A screen too narrow for the full sidebar gets the rail whatever was
  // chosen, and the choice is kept for when the window is wide again.
  const narrow = useMediaQuery(narrowScreen);
  const rail = collapsed || narrow;

  // One dialog at a time: opening the help from the palette replaces it.
  //
  // A dialog belongs to the view it was opened over. The browser's Back
  // and Forward change the view behind an open dialog, by a mouse button
  // or a swipe that no dialog can keep to itself, and the focus then goes
  // to the heading of the new view, which lies behind the dialog and is
  // hidden from a screen reader for as long as the dialog is open. So the
  // dialog is closed by the change of address itself: it is kept with the
  // address, and one that was opened at another address is not open.
  //
  // The address is the one the current address leads to. The root leads
  // to the Overview, and until the file of that view has arrived the
  // shell still stands at the root: a dialog opened in that moment was
  // opened over the Overview, and being led on is no reason to close it.
  const over = leadsTo(pathname);
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);
  if (openDialog && openDialog.at !== over) {
    // Forgotten as well, or it would open by itself when the user comes
    // back to the address.
    setOpenDialog(null);
  }
  const dialog = openDialog?.at === over ? openDialog.kind : null;
  function setDialog(kind: OpenDialog["kind"] | null) {
    setOpenDialog(kind && { kind, at: over });
  }

  // Where the popups of the page go: tooltips, menus, popovers and the
  // lists of selects (primitives/popups.tsx). It is state and not a ref,
  // because a popup that is open on the first render has to be rendered
  // again once the element is there.
  const [popups, setPopups] = useState<HTMLElement | null>(null);

  const mainRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  // The main region scrolls, and a view may hold nothing in it that takes
  // the focus.
  useKeyboardScroll(mainRef, viewRef);
  useEffect(() => {
    // The main region stays while the views change inside it, and would
    // otherwise show a new view scrolled to where the last one was left.
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    store(storageKey, next ? stored.collapsed : stored.expanded);
  }

  const state: ShellState = {
    theme,
    rail,
    sidebarSwitchable: !narrow,
    characterKeys,
  };
  const actions: ShellActions = {
    goTo: (view) => {
      // Going to the address that shows already would add an entry to the
      // history that looks no different, and Back would then seem to do
      // nothing. A link of the navigation adds none either.
      if (createPath(location) !== view.path) {
        void navigate(view.path);
      }
    },
    togglePalette: () => {
      setDialog(dialog === "palette" ? null : "palette");
    },
    showHelp: () => {
      setDialog("help");
    },
    openGallery: () => {
      // As for a view: none where the gallery shows already.
      if (createPath(location) !== galleryPath) {
        void navigate(galleryPath);
      }
    },
    toggleTheme,
    toggleSidebar,
    setCharacterKeys,
  };
  useShortcuts(shellShortcuts(state, actions));

  function closeDialog() {
    setDialog(null);
  }

  return (
    <PopupContainer element={popups}>
      <div className="grid h-full grid-rows-[3.25rem_minmax(0,1fr)] overflow-hidden">
        <SkipLink
          target={mainId}
          onSkip={() => {
            // To the heading of the view where there is one: a screen
            // reader then reads the heading and not the whole region.
            const main = mainRef.current;
            (main?.querySelector<HTMLElement>("h1") ?? main)?.focus();
          }}
        />
        <Header
          onOpenPalette={() => {
            setDialog("palette");
          }}
        />
        {/*
          The width of the sidebar moves with the handoff's one easing, and
          not at all for a user who asked the system for less motion.
        */}
        <div
          className={`grid min-h-0 transition-[grid-template-columns] duration-300 ease-handoff motion-reduce:transition-none ${
            rail
              ? "grid-cols-[3.75rem_minmax(0,1fr)]"
              : "grid-cols-[14rem_minmax(0,1fr)]"
          }`}
        >
          <Sidebar rail={rail} onToggle={narrow ? undefined : toggleSidebar} />
          <main
            id={mainId}
            ref={mainRef}
            className="min-w-0 overflow-auto px-6 pt-5 pb-12 -outline-offset-2"
          >
            <div ref={viewRef}>
              <ShortcutScope scope="view">{children}</ShortcutScope>
            </div>
            {/*
              The place for popups. It is inside the main region, so that a
              popup lies in a landmark, and outside the element whose size
              says whether the region scrolls. A popup is fixed to the
              window, so the region does not clip it. The layer is the
              handoff's for menus: over the header and under the dialogs,
              so that a tooltip the pointer left behind does not lie over
              the palette.
            */}
            <div ref={setPopups} className="relative z-40" />
          </main>
        </div>
        <CommandPalette
          open={dialog === "palette"}
          onClose={closeDialog}
          items={shellPaletteItems(state, actions)}
        />
        <ShortcutHelp open={dialog === "help"} onClose={closeDialog} />
      </div>
    </PopupContainer>
  );
}
