// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ComponentType, useEffect } from "react";
import { Link, useLocation } from "react-router";

import { PageHeader } from "../layout/PageHeader";
import { galleryTitle, type SectionId, sections } from "./page";
import { BadgeSection } from "./sections/BadgeSection";
import { ButtonSection } from "./sections/ButtonSection";
import { ChipSection } from "./sections/ChipSection";
import { ConfirmDialogSection } from "./sections/ConfirmDialogSection";
import { DialogSection } from "./sections/DialogSection";
import { DrawerSection } from "./sections/DrawerSection";
import { IconButtonSection } from "./sections/IconButtonSection";
import { InputSection } from "./sections/InputSection";
import { KbdSection } from "./sections/KbdSection";
import { MenuSection } from "./sections/MenuSection";
import { PopoverSection } from "./sections/PopoverSection";
import { SegmentedControlSection } from "./sections/SegmentedControlSection";
import { SelectSection } from "./sections/SelectSection";
import { TabsSection } from "./sections/TabsSection";
import { ToastSection } from "./sections/ToastSection";
import { TooltipSection } from "./sections/TooltipSection";

// What each section shows. The type has a key for every section of the
// list: a section without its examples does not compile.
const content: Record<SectionId, ComponentType> = {
  button: ButtonSection,
  "icon-button": IconButtonSection,
  badge: BadgeSection,
  chip: ChipSection,
  kbd: KbdSection,
  input: InputSection,
  select: SelectSection,
  "segmented-control": SegmentedControlSection,
  tabs: TabsSection,
  tooltip: TooltipSection,
  popover: PopoverSection,
  menu: MenuSection,
  dialog: DialogSection,
  "confirm-dialog": ConfirmDialogSection,
  drawer: DrawerSection,
  toast: ToastSection,
};

/**
 * The gallery: every primitive of the interface, in every look and state
 * that can be held still, and behind a button where it is something that
 * opens. It is what the tests of the primitives run on in the binary,
 * under the server's Content-Security-Policy, and what the designer looks
 * at (doc/adr/0026-ui-primitives-on-base-ui.md). Its content is made up
 * and says nothing about a cluster.
 *
 * It is a page like a view, with the page header that names the document
 * and takes the focus on arrival, and it is no view: the navigation does
 * not list it, and the command palette and its address lead to it.
 *
 * A section is reached by the fragment of the address, "/gallery#drawer",
 * from the list of sections or from a link. The section is then scrolled
 * to and its heading takes the focus, as the target of a fragment does on
 * a page the browser loaded.
 */
export function Gallery() {
  const { hash, key } = useLocation();

  useEffect(() => {
    const heading = hash === "" ? null : document.getElementById(hash.slice(1));
    if (!heading) {
      return undefined;
    }
    // Once every other effect of this step has run. The shell scrolls the
    // main region to its top and the arrival gives the focus to the page
    // header, each in an effect of a component further out, which runs
    // after this one when the gallery is arrived at with a fragment.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        heading.scrollIntoView();
        heading.focus({ preventScroll: true });
      }
    });
    return () => {
      cancelled = true;
    };
    // The key as well: a second press on the link of the section that the
    // address names already is a new arrival there.
  }, [hash, key]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3.5">
        <PageHeader
          title={galleryTitle}
          summary="Every primitive of the interface in every look and state, with made-up content. Nothing here is sent anywhere."
        />
        {/*
          A plain list and no navigation landmark: the page has one, the
          sidebar, and this list leads nowhere but down the page.
        */}
        <ul aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1">
          {sections.map(({ id, title }) => (
            <li key={id}>
              <Link to={{ hash: `#${id}` }}>{title}</Link>
            </li>
          ))}
        </ul>
      </div>
      {sections.map(({ id }) => {
        const Content = content[id];
        return <Content key={id} />;
      })}
    </div>
  );
}
