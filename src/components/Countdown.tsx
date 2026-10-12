"use client";

// Countdown display driven purely by the server-authoritative deadline.
// Clients never run their own independent timer — they derive remaining
// time from the server deadline plus a clock offset captured when the
// timer view arrived, so every screen agrees and reconnects recover the
// authoritative state.

import { useEffect, useRef, useState } from "react";
import type { TimerView } from "@/lib/engine/snapshot";

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 100) / 10);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${s.toFixed(0).padStart(2, "0")}` : s.toFixed(1);
}

/** remaining ms, or null when no timer is active */
export function useRemaining(timer: TimerView): number | null {
  const [tick, setTick] = useState(0);
  // offset = serverClock − clientClock, captured when this deadline arrived
  const offsetRef = useRef<{ deadlineMs: number | null; offset: number }>({
    deadlineMs: null,
    offset: 0,
  });

  if (offsetRef.current.deadlineMs !== timer.deadlineMs) {
    offsetRef.current = {
      deadlineMs: timer.deadlineMs,
      offset: timer.serverTimeMs - Date.now(),
    };
  }

  useEffect(() => {
    if (timer.status !== "RUNNING") return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [timer.status]);

  if (timer.status === "RUNNING" && timer.deadlineMs) {
    const serverNow = Date.now() + offsetRef.current.offset;
    return Math.max(0, timer.deadlineMs - serverNow);
  }
  if (timer.status === "PAUSED") return timer.remainingMs ?? 0;
  return null;
}

export function Countdown({
  timer,
  size = "text-5xl",
}: {
  timer: TimerView;
  size?: string;
}) {
  const remaining = useRemaining(timer);
  if (remaining === null) {
    return <div className={`${size} font-mono font-black text-muted`}>--</div>;
  }
  const urgent = remaining <= 5000 && timer.status === "RUNNING";
  return (
    <div
      className={`${size} font-mono font-black tabular-nums ${
        urgent ? "text-bad" : timer.status === "PAUSED" ? "text-warn" : "text-foreground"
      }`}
    >
      {format(remaining)}
    </div>
  );
}
