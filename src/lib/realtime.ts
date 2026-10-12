"use client";
// Client-side realtime hook: subscribes to a match over Socket.IO and keeps
// an authoritative snapshot. The DB is the source of truth — on every event
// carrying a newer version we re-fetch the snapshot, so a dropped broadcast
// can never leave a client stuck on stale state.

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { MatchSnapshot } from "./engine/snapshot";
import type { Command } from "./engine/types";

// Resolve the realtime service URL at runtime.
//
// NEXT_PUBLIC_REALTIME_URL is baked in at build time, but in offline/server
// mode the app may be opened via localhost (on the server) OR via the
// server's LAN IP (on other devices). A browser on another device cannot
// reach "localhost" — that would be itself. So we prefer the build-time
// value only when it isn't pointing at localhost; otherwise we derive the
// host from window.location so every device resolves to the server.
function resolveRealtimeUrl(): string {
  const baked = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (typeof window === "undefined") return baked ?? "http://localhost:4000";
  if (baked && !/localhost|127\.0\.0\.1/i.test(baked)) return baked; // explicit remote host
  // The baked value points at localhost, so derive the host from the page —
  // but keep its PORT (or 4000), since realtime runs on a fixed port.
  let port = "4000";
  if (baked) {
    try {
      const parsed = new URL(baked);
      if (parsed.port) port = parsed.port;
    } catch {
      /* fall back to 4000 */
    }
  }
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

const REALTIME_URL = resolveRealtimeUrl();

export type LiveEvent = { type: string; payload: Record<string, unknown> };

export type MatchLive = {
  snapshot: MatchSnapshot | null;
  connected: boolean;
  lastEvent: LiveEvent | null;
  error: string | null;
  send: (command: Command) => Promise<MatchSnapshot | null>;
  refresh: () => Promise<void>;
};

async function fetchSnapshot(
  matchId: string
): Promise<MatchSnapshot | null> {
  const res = await fetch(`/api/matches/${matchId}/snapshot`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { ok: boolean; data: MatchSnapshot };
  return json.ok ? json.data : null;
}

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
  const socketRef = useRef<Socket | null>(null);

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

  // socket connection
  useEffect(() => {
    if (!matchId) return;
    const socket = io(REALTIME_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
      socket.emit(
        "subscribe",
        { matchId },
        (reply: { ok: boolean; error?: string; snapshot?: MatchSnapshot }) => {
          if (reply?.ok) {
            if (reply.snapshot) {
              versionRef.current = 0; // snapshot from subscribe is authoritative
              applySnapshot(reply.snapshot ?? null);
            } else {
              void refresh();
            }
          } else {
            setError(reply?.error ?? "Subscription refused");
          }
        }
      );
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => {
      setConnected(false);
      setError("Realtime connection failed — retrying…");
    });

    socket.on("event", (evt: LiveEvent) => {
      setLastEvent(evt);
      const version = (evt.payload as { version?: number }).version;
      if (typeof version === "number" && version > versionRef.current) {
        // newer state exists in the DB — reconcile
        void fetchSnapshot(matchId).then(applySnapshot);
      }
    });

    return () => {
      socket.emit("unsubscribe", { matchId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, applySnapshot, refresh]);

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
