"use client";

// Timer display driven purely by the server-authoritative deadline.
// Clients never run their own independent timer — they derive remaining
// time from the server deadline plus a clock offset captured when the
// timer view arrived, so every screen agrees and reconnects recover the
// authoritative state.
//
// `TimerRing` renders the calm circular clock used across venue screen,
// school devices and the GM dashboard: a depleting ring, big digits in the
// middle, gentle ticks in the last seconds and a time-up buzz.

import { useEffect, useRef, useState } from "react";
import type { TimerView } from "@/lib/engine/snapshot";
import { playSound } from "@/lib/sound";

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 100) / 10);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${s.toFixed(0).padStart(2, "0")}` : s.toFixed(1);
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
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

  void tick;

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

const RADIUS = 44;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Countdown pill shown while the server will auto-advance the match.
 * `atMs`/`serverTimeMs` come from the snapshot; the offset between server
 * and client clocks is captured when the deadline changes.
 */
export function AutoAdvancePill({
  atMs,
  totalSec,
  serverTimeMs,
  label = "Next turn",
  className = "",
}: {
  atMs: number;
  totalSec: number;
  serverTimeMs: number;
  label?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef<{ at: number; offset: number }>({ at: -1, offset: 0 });

  if (offsetRef.current.at !== atMs) {
    offsetRef.current = { at: atMs, offset: serverTimeMs - Date.now() };
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [atMs]);

  const remaining = Math.max(0, atMs - (now + offsetRef.current.offset));
  const totalMs = Math.max(1, totalSec * 1000);
  const frac = Math.min(1, remaining / totalMs);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-muted uppercase">
        <span className="live-dot !h-2 !w-2" />
        {label} in <span className="font-mono tabular-nums">{(remaining / 1000).toFixed(1)}s</span>
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent"
          style={{ transform: `scaleX(${frac})`, transformOrigin: "left center" }}
        />
      </div>
    </div>
  );
}

/**
 * Circular depleting clock. `sound` enables the last-seconds ticks and the
 * time-up buzz (clients additionally respect their local mute preference).
 */
export function TimerRing({
  timer,
  size = 200,
  sound = false,
  label,
}: {
  timer: TimerView;
  size?: number;
  sound?: boolean;
  label?: string;
}) {
  const remaining = useRemaining(timer);
  const lastTickRef = useRef<number>(-1);

  useEffect(() => {
    if (timer.status !== "RUNNING") {
      lastTickRef.current = -1;
      return;
    }
    if (!sound || remaining === null) return;
    const whole = Math.ceil(remaining / 1000);
    if (whole === 0) {
      if (lastTickRef.current !== 0) {
        lastTickRef.current = 0;
        playSound("timeup", true);
      }
      return;
    }
    if (whole <= 5 && whole !== lastTickRef.current) {
      lastTickRef.current = whole;
      playSound(whole <= 3 ? "urgent" : "tick", true);
    }
  }, [remaining, sound, timer.status]);

  const running = timer.status === "RUNNING" && remaining !== null;
  const urgent = running && remaining! <= 5000;
  const warn = running && !urgent && remaining! <= 10000;
  const color = !running
    ? timer.status === "PAUSED"
      ? "var(--warn)"
      : "var(--line)"
    : urgent
      ? "var(--bad)"
      : warn
        ? "var(--warn)"
        : "var(--accent)";
  const duration = timer.durationMs && timer.durationMs > 0 ? timer.durationMs : null;
  const frac =
    remaining === null
      ? 0
      : duration
        ? Math.max(0, Math.min(1, remaining / duration))
        : remaining > 0
          ? 1
          : 0;

  const text = remaining === null ? "--" : formatClock(remaining);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className={`h-full w-full -rotate-90 ${urgent ? "ring-urgent" : ""}`}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--line)"
          strokeWidth="7"
          opacity="0.45"
        />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          style={{ transition: "stroke-dashoffset 140ms linear, stroke 300ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-mono font-black tabular-nums ${urgent ? "text-bad ring-urgent" : ""}`}
          style={{ fontSize: size * 0.3, color: urgent ? undefined : color }}
        >
          {text}
        </span>
        {label && (
          <span
            className="mt-0.5 font-bold tracking-widest text-muted uppercase"
            style={{ fontSize: Math.max(9, size * 0.062) }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
