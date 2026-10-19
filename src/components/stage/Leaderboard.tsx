"use client";

// Full-screen animated leaderboard takeover for the venue screen.
// Rows slide in with a stagger, scores count up, the leader gets a crown.
// Pure CSS motion (GPU-composited); scores animate via requestAnimationFrame.

import { useEffect, useRef, useState } from "react";

export type LeaderboardEntry = {
  rank: number;
  schoolId: string;
  name: string;
  abbreviation: string | null;
  logoUrl: string | null;
  score: number;
  correctCount: number;
  qualification?: string;
};

function useCountUp(target: number, durationMs = 900, delayMs = 0) {
  const [value, setValue] = useState(0);
  // start values keep the count-up continuous when a new snapshot lands
  // mid-animation (it animates from the last shown value, not from 0)
  const fromRef = useRef(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) {
      setValue(target);
      return;
    }
    let start: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(from + (target - from) * eased);
      fromRef.current = p < 1 ? next : target;
      setValue(next);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    timeout = setTimeout(() => {
      raf.current = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs, delayMs]);
  return value;
}

function Row({ entry, index, total }: { entry: LeaderboardEntry; index: number; total: number }) {
  const score = useCountUp(entry.score, 900, 250 + index * 130);
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  const isLeader = entry.rank === 1;
  return (
    <div
      className={`lb-row flex items-center gap-4 rounded-2xl border-2 px-5 py-4 shadow-xl sm:px-8 sm:py-6 ${
        isLeader
          ? "border-accent bg-accent/10"
          : entry.rank === 2
            ? "border-accent-2/70 bg-accent-2/5"
            : "border-line bg-panel"
      }`}
      style={{ animationDelay: `${index * 0.13}s` }}
    >
      <span
        className={`w-12 text-center font-black sm:w-16 ${
          isLeader ? "text-accent" : "text-muted"
        }`}
        style={{ fontSize: "clamp(1.4rem, 4vw, 3rem)" }}
      >
        {entry.rank}
      </span>
      {medal && <span className="text-2xl sm:text-4xl">{medal}</span>}
      {entry.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.logoUrl}
          alt=""
          className="h-12 w-12 rounded-full border-2 border-line object-contain sm:h-16 sm:w-16"
        />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-line bg-panel-2 text-sm font-black text-muted sm:h-16 sm:w-16">
          {(entry.abbreviation ?? entry.name).slice(0, 2).toUpperCase()}
        </span>
      )}
      <span
        className={`flex-1 truncate font-black tracking-tight ${isLeader ? "text-accent" : ""}`}
        style={{ fontSize: "clamp(1.2rem, 3.4vw, 2.6rem)" }}
      >
        {entry.name}
      </span>
      {entry.qualification === "QUALIFIED" && (
        <span className="rounded-full bg-good/20 px-3 py-1 text-xs font-black tracking-widest text-good uppercase sm:text-sm">
          Qualified
        </span>
      )}
      {entry.qualification === "ELIMINATED" && (
        <span className="rounded-full bg-bad/20 px-3 py-1 text-xs font-black tracking-widest text-bad uppercase sm:text-sm">
          Eliminated
        </span>
      )}
      {entry.qualification === "PENDING" && (
        <span className="rounded-full bg-warn/20 px-3 py-1 text-xs font-black tracking-widest text-warn uppercase sm:text-sm">
          Tie — pending
        </span>
      )}
      <span
        className="lb-score font-mono font-black"
        style={{ fontSize: "clamp(1.6rem, 5vw, 3.6rem)" }}
      >
        {score}
      </span>
      <span className="hidden w-16 text-right text-sm font-bold text-muted sm:block" style={{ fontSize: "clamp(0.8rem, 1.6vw, 1.1rem)" }}>
        pts
      </span>
    </div>
  );
}

export default function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="stage-backdrop" />
      <div
        className="stage-orb"
        style={{ width: "30vw", height: "30vw", left: "6%", top: "10%", background: "var(--accent)" }}
      />
      <div
        className="stage-orb"
        style={{ width: "24vw", height: "24vw", right: "8%", bottom: "12%", background: "var(--accent-2)", animationDelay: "-8s" }}
      />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[4vh] px-4 py-10 sm:px-10">
        <h1
          className="lb-title stage-shine relative overflow-hidden font-black tracking-tight"
          style={{ fontSize: "clamp(1.8rem, 5.5vw, 4.5rem)" }}
        >
          <span className="bg-gradient-to-r from-accent via-foreground to-accent bg-clip-text text-transparent">
            LEADERBOARD
          </span>
        </h1>
        <div className="flex w-full max-w-4xl flex-col gap-3 sm:gap-4">
          {entries.map((e, i) => (
            <Row key={e.schoolId} entry={e} index={i} total={entries.length} />
          ))}
        </div>
      </div>
    </div>
  );
}
