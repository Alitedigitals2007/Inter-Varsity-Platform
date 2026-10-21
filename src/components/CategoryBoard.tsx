"use client";

// Question board: one flat league board, questions numbered 1..N like a
// gameshow grid. Shared by the school play screen, the GM board and the venue
// screen. No category tabs — League of Rounds is one page.

import { useMemo, useSyncExternalStore } from "react";

export type BoardCellData = {
  matchQuestionId: string;
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
}: {
  cells: BoardCellData[];
  onPick?: (matchQuestionId: string) => void;
  /** sm = school/GM panel, lg = venue screen */
  size?: "sm" | "lg";
  disabled?: boolean;
}) {
  const sorted = useMemo(
    () => [...cells].sort((a, b) => a.pointValue - b.pointValue),
    [cells]
  );
  const width = useViewportWidth();

  if (sorted.length === 0) return null;
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
  const cols = Math.min(sorted.length, maxCols);
  const openCount = sorted.filter((c) => c.state === "AVAILABLE").length;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {sorted.map((cell, i) => {
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
      <p className="text-center text-xs text-muted">
        {openCount} of {sorted.length} questions left
      </p>
    </div>
  );
}
