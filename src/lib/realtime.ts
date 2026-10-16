"use client";
// Client-side live match hook.
//
// Transport, in order of preference:
//   1. Ably push — token from /api/realtime/token, SDK from Ably's CDN.
//      Near-instant event delivery; used when the server has ABLY_API_KEY.
//   2. Snapshot polling every 2.5 s — offline installer, LAN mode, no
//      Ably key, or repeated Ably failures. Still server-authoritative:
//      the snapshot endpoint lazily enforces expired timers.
//
// Either way the DB is the source of truth — on every event/poll carrying
// a newer version we re-fetch the snapshot, so a dropped broadcast can
// never leave a client stuck on stale state.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchSnapshot } from "./engine/snapshot";
import type { Command } from "./engine/types";

const ABLY_CDN = "https://cdn.ably.com/lib/ably.min.js";
const POLL_MS = 2500;

/** Ably-safe channel name — mirrors bus.ts matchChannel(). */
function matchChannel(matchId: string): string {
  return `match-${matchId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

type AblyNamespace = {
  Realtime: new (opts: Record<string, unknown>) => {
    channels: {
      get: (name: string) => {
        subscribe: (
          event: string,
          cb: (msg: { data?: { type?: string; payload?: Record<string, unknown> } }) => void
        ) => Promise<void> | void;
        unsubscribe: () => void;
      };
    };
    connection: {
      on: (ev: string, cb: (...args: unknown[]) => void) => void;
      close: () => void;
    };
    close: () => void;
  };
};

declare global {
  interface Window {
    Ably?: AblyNamespace;
  }
}

let ablyPromise: Promise<AblyNamespace | null> | null = null;

/** Load the Ably realtime SDK once; resolves null if unavailable (offline). */
function loadAbly(): Promise<AblyNamespace | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Ably) return Promise.resolve(window.Ably);
  if (ablyPromise) return ablyPromise;
  ablyPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${ABLY_CDN}"]`
    );
    const done = () => resolve(window.Ably ?? null);
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    const el = document.createElement("script");
    el.src = ABLY_CDN;
    el.async = true;
    el.onload = done;
    el.onerror = () => resolve(null);
    document.head.appendChild(el);
    // never hang a screen on a slow CDN
    setTimeout(() => resolve(window.Ably ?? null), 8000);
  });
  return ablyPromise;
}

async function fetchToken(matchId: string): Promise<
  { configured: boolean; token?: string } | null
> {
  try {
    const res = await fetch(
      `/api/realtime/token?matchId=${encodeURIComponent(matchId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok: boolean;
      data: { configured: boolean; token?: string };
    };
    return json.ok ? json.data : null;
  } catch {
    return null;
  }
}

async function fetchSnapshot(matchId: string): Promise<MatchSnapshot | null> {
  const res = await fetch(`/api/matches/${matchId}/snapshot`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { ok: boolean; data: MatchSnapshot };
  return json.ok ? json.data : null;
}

export type LiveEvent = { type: string; payload: Record<string, unknown> };

export type MatchLive = {
  snapshot: MatchSnapshot | null;
  connected: boolean;
  lastEvent: LiveEvent | null;
  error: string | null;
  send: (command: Command) => Promise<MatchSnapshot | null>;
  refresh: () => Promise<void>;
};

/**
 * Live match state for any role. Role-specific data (answer keys, leaderboard
 * when hidden, etc.) is filtered server-side by session cookie.
 */
export function useMatchRealtime(matchId: string | null): MatchLive {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const applySnapshot = useCallback((snap: MatchSnapshot | null) => {
    if (snap && snap.version >= versionRef.current) {
      versionRef.current = snap.version;
      setSnapshot(snap);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    try {
      applySnapshot(await fetchSnapshot(matchId));
      setError(null);
    } catch {
      setError("Could not reach the server");
    }
  }, [matchId, applySnapshot]);

  // initial load
  useEffect(() => {
    versionRef.current = 0;
    setSnapshot(null);
    if (matchId) void refresh();
  }, [matchId, refresh]);

  // transport: ably push with automatic polling fallback
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    let channelUnsub: (() => void) | null = null;
    let ablyClose: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (cancelled || pollTimer) return;
      setConnected(true); // polling still means "live-ish"
      pollTimer = setInterval(() => {
        fetchSnapshot(matchId)
          .then((snap) => {
            if (cancelled) return;
            if (snap) {
              applySnapshot(snap);
              setError(null);
            }
          })
          .catch(() => {
            if (!cancelled) setError("Network error — retrying…");
          });
      }, POLL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    (async () => {
      const auth = await fetchToken(matchId);
      if (cancelled) return;
      if (!auth?.configured || !auth.token) {
        startPolling();
        return;
      }
      const Ably = await loadAbly();
      if (cancelled) return;
      if (!Ably) {
        startPolling();
        return;
      }
      try {
        const client = new Ably.Realtime({ token: auth.token, autoConnect: true });
        ablyClose = () => client.close();
        const channel = client.channels.get(matchChannel(matchId));
        channelUnsub = () => channel.unsubscribe();
        client.connection.on("connected", () => {
          if (!cancelled) {
            setConnected(true);
            setError(null);
          }
        });
        client.connection.on("disconnected", () => {
          if (!cancelled) setConnected(false);
        });
        client.connection.on("update", () => {
          /* keep-alive */
        });
        channel.subscribe("event", (msg) => {
          if (cancelled) return;
          const evt = msg.data as LiveEvent | undefined;
          if (!evt?.type) return;
          setLastEvent(evt);
          const version = (evt.payload as { version?: number } | undefined)?.version;
          if (typeof version === "number" && version > versionRef.current) {
            void fetchSnapshot(matchId).then(applySnapshot);
          }
        });
        // seed current state immediately
        void fetchSnapshot(matchId).then(applySnapshot);
      } catch {
        if (!cancelled) startPolling();
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      try {
        channelUnsub?.();
        ablyClose?.();
      } catch {
        /* ignore */
      }
    };
  }, [matchId, applySnapshot]);

  /** Send a command; returns the authoritative post-command snapshot. */
  const send = useCallback(
    async (command: Command): Promise<MatchSnapshot | null> => {
      if (!matchId) return null;
      try {
        const res = await fetch(`/api/matches/${matchId}/command`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: { message?: string };
          data?: { snapshot: MatchSnapshot };
        };
        if (!json.ok) {
          setError(json.error?.message ?? "Command rejected");
          return null;
        }
        setError(null);
        if (json.data?.snapshot) applySnapshot(json.data.snapshot);
        return json.data?.snapshot ?? null;
      } catch {
        setError("Network error — command not sent");
        return null;
      }
    },
    [matchId, applySnapshot]
  );

  return { snapshot, connected, lastEvent, error, send, refresh };
}
