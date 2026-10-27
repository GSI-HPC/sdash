// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { Button } from "../../primitives/Button";
import {
  CellGrid,
  type GridCell,
  type GridTone,
} from "../../primitives/CellGrid";
import { Example, Section } from "../Section";

const tones: readonly GridTone[] = [
  { tone: "ok", label: "Fine" },
  { tone: "warn", label: "Warning" },
  { tone: "err", label: "Error" },
  { tone: "neutral", label: "Idle" },
];

/** As many cells as asked, their tones in a fixed pattern. */
function cellsOf(count: number): GridCell[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const tone =
      number % 17 === 0
        ? "err"
        : number % 7 === 0
          ? "warn"
          : number % 11 === 0
            ? "neutral"
            : "ok";
    return {
      id: `cell-${String(number)}`,
      label: `Cell ${String(number)}`,
      tone,
      ...(number % 5 === 0
        ? { detail: `Example detail ${String(number)}` }
        : {}),
    };
  });
}

const few = cellsOf(120);
const many = cellsOf(4000);

/**
 * A grid of 120 cells that can be pressed, and one of 4,000 behind a
 * button. The large one is not on the page from the start: every test of
 * the gallery would otherwise look through its cells too.
 */
export function CellGridSection() {
  const [pressed, setPressed] = useState<string | null>(null);
  const [large, setLarge] = useState(false);

  return (
    <Section id="cell-grid">
      <Example title="120 cells; Enter, Space or a click presses one">
        <div className="flex w-full flex-col gap-2">
          <CellGrid
            label="Example cells"
            cells={few}
            tones={tones}
            onActivate={(cell) => {
              setPressed(cell.label);
            }}
          />
          <p role="status" className="text-[0.71875rem] text-t2">
            {pressed === null ? "No cell pressed yet." : `Pressed ${pressed}.`}
          </p>
        </div>
      </Example>
      <Example title="4,000 cells">
        {large ? (
          <CellGrid
            label="Many example cells"
            cells={many}
            tones={tones}
            className="w-full"
          />
        ) : (
          <Button
            onClick={() => {
              setLarge(true);
            }}
          >
            Show 4,000 cells
          </Button>
        )}
      </Example>
      <Example title="No cells">
        <CellGrid label="No example cells" cells={[]} tones={tones} />
      </Example>
    </Section>
  );
}
