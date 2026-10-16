import { ablyEnabled, ablyPublish } from "./ably";

// Event bus: publishes committed engine events to Ably channels so browsers
// reconcile instantly. The database is the source of truth — if a publish is
// missed (or Ably is not configured), clients fall back to snapshot polling
// and never see stale state.

/** `match-{id}` — Ably-safe channel name. */
export function matchChannel(matchId: string): string {
  return `match-${matchId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/** `channel-{name}` for cross-cutting channels (admin, public…). */
export function namedChannel(name: string): string {
  return `channel-${name.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/**
 * Fire-and-forget broadcast of one engine event.
 * No-op when ABLY_API_KEY is absent (offline / local / polling-only mode).
 */
export async function emitToMatch(
  matchId: string,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  if (!ablyEnabled()) return;
  try {
    await ablyPublish(matchChannel(matchId), "event", { type, payload });
  } catch (err) {
    console.error("[bus] emit failed", matchId, type, err);
  }
}

/** Broadcast to a named channel (e.g. "admin", "public"). */
export async function emitToChannel(
  channel: string,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  if (!ablyEnabled()) return;
  try {
    await ablyPublish(namedChannel(channel), "event", { type, payload });
  } catch (err) {
    console.error("[bus] channel emit failed", channel, type, err);
  }
}
