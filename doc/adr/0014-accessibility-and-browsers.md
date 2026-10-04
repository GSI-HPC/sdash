<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0014: WCAG 2.1 AA, a browser list, and no pixel accuracy

Status: accepted

## Context

The design handoff in [`design/`](../design/) calls itself high-fidelity and
asks to be recreated pixel-accurately. It is a prototype: it has no ARIA and
its focus outlines are removed
([research/slurmrestd.md](../research/slurmrestd.md#9-corrections-to-the-design-handoff)).
It names no accessibility target and no browsers to support. The project
owner is its designer.

## Decision

- The accessibility target is WCAG 2.1, level AA.
- An automated axe scan of every view runs in CI, in the Playwright suite
  ([0015](0015-how-tests-are-written.md)).
- Supported browsers are the latest two releases of Chrome, Edge, Firefox
  and Safari, and the current Firefox ESR.
- Pixel accuracy against the prototype is not required. The handoff is the
  reference for look and interaction, not for measurements.
- A change to the design is discussed with the owner directly.

Accessibility is added while the UI is rebuilt: focus rings, ARIA for the
components sdash owns, and a contrast pass over the token values
([initial-conclusions.md](../initial-conclusions.md#8-frontend)).

## Costs

- An automated scan finds only what a tool can see. Keyboard operation,
  focus order and what a screen reader says are checked by a person, view
  by view.
- A view is not finished without its scan, and a failing scan fails CI as
  a failing test does.
- Token values may change for contrast, and focus rings come back, so the
  built UI will not match the prototype.
- Playwright drives a WebKit build, not Safari, and a current Firefox, not
  the ESR. Those two are covered in CI only as far as the engines agree.
- A browser older than the list gets no promise, which a user on a machine
  with a held-back browser will notice first.
- The design has one owner. A design question waits for him.
