"use client";

// Question board, grouped by category when the supplied cells span more than
// one. Shared by the school play screen, the GM board and the venue screen.

import { useMemo, useSyncExternalStore } from "react";

export type BoardCellData = {
  matchQuestionId: string;
  categoryId?: string;
  categoryName: string;
  pointValue: number;
  state: string;
};

// Stable identities — an inline subscribe/getSnapshot pair would resubscribe
// on every render.
function subscribeViewport(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}
const getViewportWidth = () => window.innerWidth;
const getServerViewportWidth = () => 1280;

/** Viewport width as external store — responsive columns without an effect. */
function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeViewport,
    getViewportWidth,
    getServerViewportWidth
  );
}

export default function CategoryBoard({
  cells,
  onPick,
  size = "sm",
  disabled = false,
  categoryOrder,
}: {
  cells: BoardCellData[];
  onPick?: (matchQuestionId: string) => void;
  /** sm = school/GM panel, lg = venue screen */
  size?: "sm" | "lg";
  disabled?: boolean;
  /** Display order of the category boards (ids). */
  categoryOrder?: string[];
}) {
  const groups = useMemo(() => {
    const byCat = new Map<string, { id: string; name: string; cells: BoardCellData[] }>();
    for (const cell of cells) {
      const key = cell.categoryId ?? cell.categoryName;
      const group = byCat.get(key) ?? {
        id: cell.categoryId ?? key,
        name: cell.categoryName,
        cells: [],
      };
      group.cells.push(cell);
      byCat.set(key, group);
    }
    const list = [...byCat.values()];
    for (const group of list) {
      group.cells.sort((a, b) => a.pointValue - b.pointValue);
    }
    if (categoryOrder && categoryOrder.length > 0) {
      const rank = new Map(categoryOrder.map((id, i) => [id, i]));
      list.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    }
    return list;
  }, [cells, categoryOrder]);

  const width = useViewportWidth();
  const lg = size === "lg";
  // Columns adapt to the device: phones keep a compact grid, tablets/full
  // screens open up to the full board width.
  const maxCols = lg
    ? width < 480
      ? 4
      : width < 768
        ? 6
        : width < 1100
          ? 8
          : 10
    : width < 380
      ? 3
      : 4;

  if (groups.length === 0) return null;
  const totalOpen = cells.filter((c) => c.state === "AVAILABLE").length;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const cols = Math.min(group.cells.length, maxCols);
        const openCount = group.cells.filter((c) => c.state === "AVAILABLE").length;
        return (
          <div key={group.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`font-black tracking-wide ${lg ? "text-base sm:text-2xl" : "text-sm"}`}>
                {group.name}
              </span>
              <span className={`text-muted ${lg ? "text-xs sm:text-base" : "text-xs"}`}>
                {openCount} of {group.cells.length} left
              </span>
            </div>
            <div
              className="grid gap-2 sm:gap-3"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {group.cells.map((cell, i) => {
                const taken = cell.state !== "AVAILABLE";
                const pickable = !!onPick && !taken && !disabled;
                return (
                  <button
                    key={cell.matchQuestionId}
                    disabled={!pickable}
                    onClick={() => onPick?.(cell.matchQuestionId)}
                    className={`board-cell-pop flex flex-col items-center justify-center rounded-xl border-2 transition-colors ${
                      lg ? "px-1 py-3 sm:px-2 sm:py-5" : "px-1 py-3"
                    } ${
                      taken
                        ? "border-line/50 bg-panel-2/60 text-muted/40"
                        : pickable
                          ? "border-accent/70 bg-accent/10 text-accent hover:bg-accent/20 active:scale-95"
                          : "border-accent-2/50 bg-accent-2/10 text-foreground"
                    }`}
                  >
                    <span
                      className={`font-black leading-none ${taken ? "line-through" : ""}`}
                      style={{ fontSize: lg ? "clamp(1.6rem, 3.2vw, 2.8rem)" : "1.25rem" }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`font-bold ${taken ? "text-muted/30" : "opacity-70"}`}
                      style={{ fontSize: lg ? "clamp(0.7rem, 1.4vw, 1rem)" : "0.65rem" }}
                    >
                      {taken ? "✓" : `${cell.pointValue} pts`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {groups.length > 1 && (
        <p className="text-center text-xs text-muted">
          {totalOpen} of {cells.length} questions left across {groups.length} categories
        </p>
      )}
    </div>
  );
}
