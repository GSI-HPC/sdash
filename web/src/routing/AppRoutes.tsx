// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ComponentType, lazy, type LazyExoticComponent } from "react";
import { Navigate, useLocation } from "react-router";

import { galleryPath } from "../gallery/page";
import { NotFound } from "../views/NotFound";
import { leadsTo, viewAt, type ViewId } from "./views";

// The component of each view, loaded when the view is first opened, so
// that a view is a file of its own and the page starts with the shell
// alone (doc/adr/0013-frontend-stack.md). The type has a key for every
// row of the view table: a view without a component does not compile.
const components: Record<ViewId, LazyExoticComponent<ComponentType>> = {
  overview: lazy(async () => ({
    default: (await import("../views/Overview")).Overview,
  })),
  nodes: lazy(async () => ({
    default: (await import("../views/Nodes")).Nodes,
  })),
  partitions: lazy(async () => ({
    default: (await import("../views/Partitions")).Partitions,
  })),
  reservations: lazy(async () => ({
    default: (await import("../views/Reservations")).Reservations,
  })),
  jobs: lazy(async () => ({
    default: (await import("../views/Jobs")).Jobs,
  })),
  submit: lazy(async () => ({
    default: (await import("../views/Submit")).Submit,
  })),
  history: lazy(async () => ({
    default: (await import("../views/History")).History,
  })),
  accounts: lazy(async () => ({
    default: (await import("../views/Accounts")).Accounts,
  })),
  qos: lazy(async () => ({
    default: (await import("../views/Qos")).Qos,
  })),
  diagnostics: lazy(async () => ({
    default: (await import("../views/Diagnostics")).Diagnostics,
  })),
  conf: lazy(async () => ({
    default: (await import("../views/Conf")).Conf,
  })),
  "api-explorer": lazy(async () => ({
    default: (await import("../views/ApiExplorer")).ApiExplorer,
  })),
};

// The gallery of the primitives, loaded when it is first opened like a
// view, and a file of its own in the build. It is no view: the view table
// has no row for it, so the navigation lists and marks nothing for it
// (doc/adr/0026-ui-primitives-on-base-ui.md).
const Gallery = lazy(async () => ({
  default: (await import("../gallery/Gallery")).Gallery,
}));

/**
 * What the address shows: the root leads to the start view of the view
 * table, each view shows at its address, the gallery at its own, and any
 * other address shows the not-found view. All of it renders inside the
 * shell (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
 *
 * Which view an address shows is asked of the view table (viewAt) and not
 * of the router's own matching, which takes "/Nodes" and "/nodes/" for
 * "/nodes": a view would then have addresses nobody gave it.
 *
 * The redirect from the root replaces the entry in the history, so that
 * Back leaves sdash and does not bounce off the root.
 */
export function AppRoutes() {
  const { pathname } = useLocation();
  const target = leadsTo(pathname);
  if (target !== pathname) {
    return <Navigate to={target} replace />;
  }
  if (pathname === galleryPath) {
    return <Gallery />;
  }
  const view = viewAt(pathname);
  if (!view) {
    return <NotFound />;
  }
  const View = components[view.id];
  return <View />;
}
