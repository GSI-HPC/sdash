// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { Placeholder } from "./Placeholder";

/**
 * The Job history view: finished jobs from accounting.
 *
 * It is a placeholder until the Slurm-facing work can start
 * (doc/adr/0016-e2e-and-fixtures-on-sind.md).
 */
export function History() {
  return <Placeholder view="history" />;
}
