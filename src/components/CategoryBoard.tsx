"use client";

// Question board: one category at a time (tabs), questions numbered 1..N
// like a gameshow grid. Shared by the school play screen, the GM board and
// the venue screen. Numbers are per-category ranks by point value.

import { useMemo, useState } from "react";

export type BoardCellData = {
  matchQuestionId: string;
  categoryName: string;
  pointValue: number;
  state: string;
};

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
  const categories = useMemo(() => {
    const byCat = new Map<string, BoardCellData[]>();
    for (const cell of cells) {
      const list = byCat.get(cell.categoryName) ?? [];
      list.push(cell);
      byCat.set(cell.categoryName, list);
    }
    return [...byCat.entries()].map(([name, list]) => ({
      name,
      cells: [...list].sort((a, b) => a.pointValue - b.pointValue),
    }));
  }, [cells]);

  const firstOpen = categories.find((c) => c.cells.some((x) => x.state === "AVAILABLE"));
  const [activeName, setActiveName] = useState<string | null>(null);
  const active =
    categories.find((c) => c.name === activeName) ??
    firstOpen ??
    categories[0] ??
    null;

  if (!active) return null;
  const lg = size === "lg";

  return (
    <div className="flex flex-col gap-3">
      {/* category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const openCount = c.cells.filter((x) => x.state === "AVAILABLE").length;
          const isActive = c.name === active.name;
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => setActiveName(c.name)}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
                isActive
                  ? "border-accent bg-accent text-black"
                  : "border-line bg-panel-2 text-muted hover:text-foreground"
              }`}
            >
              {c.name}
              <span
                className={`ml-2 rounded-full px-1.5 text-[10px] ${
                  isActive ? "bg-black/20" : "bg-line/60"
                }`}
              >
                {openCount}/{c.cells.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* numbered grid for the active category */}
      <div
        className="grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(active.cells.length, lg ? 10 : 4)}, minmax(0, 1fr))` }}
      >
        {active.cells.map((cell, i) => {
          const taken = cell.state !== "AVAILABLE";
          const pickable = !!onPick && !taken && !disabled;
          return (
            <button
              key={cell.matchQuestionId}
              disabled={!pickable}
              onClick={() => onPick?.(cell.matchQuestionId)}
              className={`board-cell-pop flex flex-col items-center justify-center rounded-xl border-2 transition-colors ${
                lg ? "px-2 py-5" : "px-1 py-3"
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
        {active.name} — {active.cells.filter((c) => c.state === "AVAILABLE").length} of{" "}
        {active.cells.length} questions left
      </p>
    </div>
  );
}
