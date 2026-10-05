// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { StatusSummary } from "../status/StatusSummary";
import { Placeholder } from "./Placeholder";

/**
 * The Overview, the view sdash starts with. Of what the design gives it,
 * the state of the cluster, nothing can be shown yet. What it does show is
 * which sdash is running, the one thing the browser API can say today.
 */
export function Overview() {
  return (
    <Placeholder view="overview">
      <StatusSummary />
    </Placeholder>
  );
}
