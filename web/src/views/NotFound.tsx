// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Link, useLocation } from "react-router";

import { PageHeader } from "../layout/PageHeader";
import { startView } from "../routing/views";

/**
 * What an address shows that belongs to no view: a link that was mistyped,
 * or one into a later sdash than the one that runs. It is a page inside
 * the shell like any other, so the navigation is there to leave it by.
 *
 * The server answers every address with the application
 * (internal/server), so it is the application that has to say that there
 * is nothing at this one.
 */
export function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        title="Page not found"
        summary="This sdash has no view at the address below."
      />
      <p className="font-mono text-[0.78125rem] break-all">{pathname}</p>
      <p>
        <Link to={startView.path}>Go to the {startView.title}</Link>
      </p>
    </div>
  );
}
