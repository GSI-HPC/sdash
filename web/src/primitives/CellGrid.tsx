// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import {
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cx, floating, layers } from "./classes";
import { type GraphicTone, graphicTones } from "./graphics";
import { Legend } from "./Legend";
import { usePopupPlacement } from "./popups";

/** One cell of a cell grid. */
export interface GridCell {
  /** Unique within the grid, and its key in React. */
  id: string;
  /** What the cell stands for: the first line of its tooltip and of its name. */
  label: string;
  tone: GraphicTone;
  /** A line more for the tooltip and the name. */
  detail?: string;
}

/** What one tone of a grid stands for. */
export interface GridTone {
  tone: GraphicTone;
  /** The word for the tone, in the legend, the tooltip and the name of a cell. */
  label: string;
}

/** The props of a cell grid. */
export interface CellGridProps {
  /** What the cells are, and the name of the grid. */
  label: string;
  cells: readonly GridCell[];
  /**
   * The tones the cells have, each with its word, in the order of the
   * legend. A tone a cell has and the legend does not name is told by
   * the cell's label and detail alone.
   */
  tones: readonly GridTone[];
  /** Called with a cell that is pressed, or that has the focus when Enter or Space is pressed. */
  onActivate?: (cell: GridCell) => void;
  /** What stands in place of a grid with no cells; "Nothing to show." unless said otherwise. */
  emptyText?: string;
  /** Classes for the layout around the grid, never for its look. */
  className?: string;
}

// The handoff's cells: 10 px squares 3 px apart.
const cellSize = 10;
const cellGap = 3;

/** How many cells fit side by side in a width. */
export function columnsIn(width: number): number {
  return Math.max(1, Math.floor((width + cellGap) / (cellSize + cellGap)));
}

/**
 * The cell the keyboard moves to from another: the arrow keys by one cell
 * or one row, stopping at the edges, Home and End to either end of the
 * row, and with Control to the first and the last cell. Null for a key
 * the grid does not take.
 */
export function moveFrom(
  from: number,
  count: number,
  columns: number,
  { key, ctrlKey }: { key: string; ctrlKey: boolean },
): number | null {
  const rowStart = from - (from % columns);
  switch (key) {
    case "ArrowRight":
      return ctrlKey ? null : Math.min(count - 1, from + 1);
    case "ArrowLeft":
      return ctrlKey ? null : Math.max(0, from - 1);
    case "ArrowDown":
      return ctrlKey ? null : from + columns < count ? from + columns : from;
    case "ArrowUp":
      return ctrlKey ? null : from - columns >= 0 ? from - columns : from;
    case "Home":
      return ctrlKey ? 0 : rowStart;
    case "End":
      return ctrlKey ? count - 1 : Math.min(count - 1, rowStart + columns - 1);
    default:
      return null;
  }
}

/** How long the pointer rests on a cell before the tooltip comes to it. */
const delay = 300;

/** How long the tooltip waits for the pointer that left the grid to reach it. */
const grace = 150;

/** Who brought the tooltip to its cell. */
type Owner = "pointer" | "keyboard";

/** The index of the cell an event happened on, if it was on one. */
function cellOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const index = target.closest<HTMLElement>("[data-cell]")?.dataset.cell;
  return index === undefined ? null : Number(index);
}

/** The name of a cell: its label, the word of its tone, its detail. */
function nameOf(cell: GridCell, words: ReadonlyMap<GraphicTone, string>) {
  return [cell.label, words.get(cell.tone), cell.detail]
    .filter((part) => part !== undefined && part !== "")
    .join(", ");
}

/**
 * One row of the grid. A row is drawn again only when its cells change or
 * the focus comes to it or leaves it, so that a move of the focus redraws
 * two rows and not thousands of cells.
 */
const Row = memo(function Row({
  cells,
  first,
  focused,
  idPrefix,
  words,
}: {
  cells: readonly GridCell[];
  first: number;
  /** The index in the row of the cell that has the focus and shows it, or -1. */
  focused: number;
  idPrefix: string;
  words: ReadonlyMap<GraphicTone, string>;
}) {
  return (
    <div role="row" className="flex gap-[3px]">
      {cells.map((cell, index) => (
        <div
          key={cell.id}
          id={`${idPrefix}${String(first + index)}`}
          role="gridcell"
          aria-label={nameOf(cell, words)}
          data-cell={first + index}
          className={cx(
            "size-2.5 shrink-0 rounded-[2px] forced-colors:bg-[color:CanvasText]",
            graphicTones[cell.tone].background,
            index === focused &&
              "outline-2 outline-offset-1 outline-focus outline-solid",
          )}
        />
      ))}
    </div>
  );
});

/**
 * A dense grid of small cells, each in the colour of its tone: many
 * things of one kind at a glance, which of them are fine and which not.
 * The legend below says what each colour stands for and how many cells
 * have it.
 *
 * To the keyboard the grid is one stop of the Tab key, however many cells
 * it has. Inside it the arrow keys move the focus from cell to cell,
 * Home and End to the ends of the row, and with Control to the first and
 * the last cell; Enter and Space press the cell. The focus stays on the
 * grid and aria-activedescendant names the cell, whose name is read: its
 * label, the word of its tone and its detail, so nothing is said by
 * colour alone (WCAG 2.1, success criterion 1.4.1). The grid is as wide
 * as its container and lays its cells out in rows of as many as fit, and
 * measures again when its width changes, so that Up and Down go to the
 * cell above and below. It takes the width it is given and does not ask
 * for one: a container that is as wide as its content, an inline block or
 * a column of a grid sized to its content, gives it the width of one
 * cell.
 *
 * The grid has one tooltip, which shows the label, the tone and the
 * detail of a cell beside it, and goes where the user's attention is: at
 * once to the cell the keyboard moves to, and to the cell under the
 * pointer once the pointer has rested on it for a moment. Whichever moved
 * last owns it. A pointer that did not move does not take it: when the
 * page scrolls under a still pointer the browser reports the pointer over
 * a new cell without its having moved. Escape puts the tooltip away, the
 * pointer can move onto it, and it stays for as long as the pointer or
 * the focus is on its cell (WCAG 2.1, success criterion 1.4.13). A touch
 * on a cell shows its tooltip, and a second touch presses it. The tooltip
 * is hidden from assistive technology, which has the same words as the
 * name of the cell.
 *
 * Where the system forces its colours every cell is drawn in the colour
 * of text, and the tooltip and the names are what tell the cells apart.
 */
export function CellGrid({
  label,
  cells,
  tones,
  onActivate,
  emptyText = "Nothing to show.",
  className,
}: CellGridProps) {
  const placement = usePopupPlacement();
  const idPrefix = `${useId()}-cell-`;
  const grid = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<number | null>(null);
  const [chosen, setChosen] = useState(0);
  const [ring, setRing] = useState(false);
  const [tip, setTip] = useState<{ index: number; owner: Owner } | null>(null);

  const count = cells.length;
  const active = Math.min(chosen, Math.max(0, count - 1));
  const shown = tip !== null && tip.index < count ? tip : null;

  const words = useMemo(
    () => new Map(tones.map(({ tone, label: word }) => [tone, word])),
    [tones],
  );
  // Counted once for the cells, not on every move of the focus.
  const counts = useMemo(() => {
    const byTone = new Map<GraphicTone, number>();
    for (const { tone } of cells) {
      byTone.set(tone, (byTone.get(tone) ?? 0) + 1);
    }
    return byTone;
  }, [cells]);
  const rows = useMemo(() => {
    if (columns === null) {
      return [];
    }
    const chunks: { first: number; cells: readonly GridCell[] }[] = [];
    for (let first = 0; first < count; first += columns) {
      chunks.push({ first, cells: cells.slice(first, first + columns) });
    }
    return chunks;
  }, [cells, columns, count]);

  // Timers and the last place of the pointer are no state: a move of the
  // pointer that changes nothing that shows must not draw the grid again.
  const restTimer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  const lastPlace = useRef<{ x: number; y: number } | null>(null);
  const pointerType = useRef<string>("mouse");

  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) {
      return undefined;
    }
    setColumns(columnsIn(element.clientWidth));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setColumns(columnsIn(entry.contentRect.width));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [count]);

  useEffect(
    () => () => {
      window.clearTimeout(restTimer.current);
      window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  // The tooltip beside its cell, above it where there is room and below it
  // otherwise, and inside the window. It is placed again when anything
  // scrolls or the window changes size, and hidden while its cell is out
  // of sight. The place is set through the CSS object model, which the
  // Content-Security-Policy allows, unlike a style attribute.
  useLayoutEffect(() => {
    const popup = tooltip.current;
    if (shown === null || !popup) {
      return undefined;
    }
    const cellId = `${idPrefix}${String(shown.index)}`;
    function place() {
      const cell = document.getElementById(cellId);
      if (!popup || !cell) {
        return;
      }
      const target = cell.getBoundingClientRect();
      const { width, height } = popup.getBoundingClientRect();
      const margin = 8;
      const offset = 6;
      const left = Math.min(
        Math.max(margin, target.left + target.width / 2 - width / 2),
        window.innerWidth - margin - width,
      );
      const above = target.top - offset - height;
      const top = above >= margin ? above : target.bottom + offset;
      popup.style.left = `${String(Math.round(left))}px`;
      popup.style.top = `${String(Math.round(top))}px`;
      const visible =
        target.bottom > 0 &&
        target.top < window.innerHeight &&
        target.right > 0 &&
        target.left < window.innerWidth;
      popup.style.visibility = visible ? "" : "hidden";
    }
    place();
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [shown, idPrefix, columns]);

  // Escape belongs to the tooltip for as long as it shows, before anything
  // else has the key: a drawer the grid is in closes on the next press, as
  // with every tooltip (Tooltip.tsx). A press anywhere but on the grid and
  // on the tooltip puts it away too, which is how a touch screen dismisses
  // it.
  const showing = shown !== null;
  useEffect(() => {
    if (!showing) {
      return undefined;
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(restTimer.current);
      setTip(null);
    }
    function onPointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !grid.current?.contains(target) &&
        !tooltip.current?.contains(target)
      ) {
        setTip(null);
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [showing]);

  // The keyboard's cell is brought into sight, also when the focus comes
  // to the grid: Firefox does not scroll to an element that has the focus
  // and is half in sight, and the cell is not what has the focus.
  function showByKeyboard(index: number) {
    setChosen(index);
    setRing(true);
    window.clearTimeout(restTimer.current);
    setTip({ index, owner: "keyboard" });
    document
      .getElementById(`${idPrefix}${String(index)}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0 || event.altKey || event.metaKey) {
      return;
    }
    const cell = cells[active];
    if (event.key === "Enter" || event.key === " ") {
      if (onActivate && cell) {
        event.preventDefault();
        onActivate(cell);
      }
      return;
    }
    const next = moveFrom(active, count, columns ?? 1, event);
    if (next === null) {
      return;
    }
    // Also at an edge, where the focus stays: the key is the grid's, and
    // must not scroll the page or reach a shortcut.
    event.preventDefault();
    showByKeyboard(next);
  }

  /**
   * Whether the pointer is on its way from the cell that has the tooltip
   * to the tooltip: in the strip between the two. A cell the pointer
   * crosses there does not take the tooltip, which could otherwise not be
   * reached from a cell whose tooltip lies over the cells above it.
   */
  function onTheWay(x: number, y: number): boolean {
    const popup = tooltip.current;
    const cell =
      shown && document.getElementById(`${idPrefix}${String(shown.index)}`);
    if (!popup || !cell) {
      return false;
    }
    const from = cell.getBoundingClientRect();
    const to = popup.getBoundingClientRect();
    const [top, bottom] =
      to.bottom <= from.top ? [to.bottom, from.top] : [from.bottom, to.top];
    return (
      x >= Math.min(from.left, to.left) &&
      x <= Math.max(from.right, to.right) &&
      y >= top &&
      y <= bottom
    );
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      return;
    }
    const last = lastPlace.current;
    const { clientX: x, clientY: y } = event;
    if (last && Math.abs(last.x - x) <= 1 && Math.abs(last.y - y) <= 1) {
      return;
    }
    lastPlace.current = { x, y };
    window.clearTimeout(leaveTimer.current);
    const index = cellOf(event.target);
    if (index === null || index === shown?.index) {
      window.clearTimeout(restTimer.current);
      return;
    }
    if (shown?.owner === "pointer") {
      if (!onTheWay(x, y)) {
        setTip({ index, owner: "pointer" });
      }
      return;
    }
    window.clearTimeout(restTimer.current);
    restTimer.current = window.setTimeout(() => {
      setTip({ index, owner: "pointer" });
    }, delay);
  }

  function onPointerLeave(event: PointerEvent<HTMLDivElement>) {
    // A finger leaves the grid each time it is lifted, and has not gone
    // anywhere: its tooltip stays until a press elsewhere.
    if (event.pointerType === "touch") {
      return;
    }
    window.clearTimeout(restTimer.current);
    if (shown?.owner !== "pointer") {
      return;
    }
    leaveTimer.current = window.setTimeout(() => {
      setTip((current) => (current?.owner === "pointer" ? null : current));
    }, grace);
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const index = cellOf(event.target);
    const cell = index === null ? undefined : cells[index];
    if (index === null || !cell) {
      return;
    }
    setChosen(index);
    if (pointerType.current === "touch" && shown?.index !== index) {
      setTip({ index, owner: "pointer" });
      return;
    }
    onActivate?.(cell);
  }

  if (count === 0) {
    return (
      <p className={cx("text-[0.78125rem] text-t2", className)}>{emptyText}</p>
    );
  }

  const shownCell = shown ? cells[shown.index] : undefined;

  return (
    <div className={cx("flex w-full min-w-0 flex-col gap-2.5", className)}>
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        tabIndex={0}
        aria-activedescendant={`${idPrefix}${String(active)}`}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (
            event.target === event.currentTarget &&
            event.currentTarget.matches(":focus-visible")
          ) {
            showByKeyboard(active);
          }
        }}
        onBlur={() => {
          setRing(false);
          setTip((current) => (current?.owner === "keyboard" ? null : current));
        }}
        onPointerDown={(event) => {
          pointerType.current = event.pointerType;
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        className="flex flex-col gap-[3px] rounded-xs outline-none"
      >
        {rows.map((row) => (
          <Row
            key={row.first}
            cells={row.cells}
            first={row.first}
            focused={
              ring &&
              active >= row.first &&
              active < row.first + row.cells.length
                ? active - row.first
                : -1
            }
            idPrefix={idPrefix}
            words={words}
          />
        ))}
      </div>
      <Legend
        items={tones.map(({ tone, label: word }) => ({
          label: word,
          tone,
          value: String(counts.get(tone) ?? 0),
        }))}
      />
      {shownCell &&
        createPortal(
          <div
            ref={tooltip}
            aria-hidden="true"
            data-slot="tooltip"
            onPointerEnter={() => {
              window.clearTimeout(leaveTimer.current);
            }}
            onPointerLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !grid.current?.contains(event.relatedTarget)
              ) {
                setTip((current) =>
                  current?.owner === "pointer" ? null : current,
                );
              }
            }}
            className={cx(
              floating,
              layers.tooltip,
              "fixed top-0 left-0 flex w-max max-w-64 flex-col gap-0.5 rounded-[5px] px-2 py-1.5 text-xs wrap-anywhere",
            )}
          >
            <span className="font-medium">{shownCell.label}</span>
            {words.has(shownCell.tone) && (
              <span className="flex items-center gap-1.5 text-t2">
                <span
                  className={cx(
                    "size-2 shrink-0 rounded-[2px] forced-colors:bg-[color:CanvasText]",
                    graphicTones[shownCell.tone].background,
                  )}
                />
                {words.get(shownCell.tone)}
              </span>
            )}
            {shownCell.detail !== undefined && (
              <span className="text-t2">{shownCell.detail}</span>
            )}
          </div>,
          placement.portal.container ?? document.body,
        )}
    </div>
  );
}
