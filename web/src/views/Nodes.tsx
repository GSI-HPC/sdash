// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Placeholder } from "./Placeholder";

/**
 * The Nodes view: the nodes of the cluster as a heat map.
 *
 * It is a placeholder until the Slurm-facing work can start
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 */
export function Nodes() {
  return <Placeholder view="nodes" />;
}
