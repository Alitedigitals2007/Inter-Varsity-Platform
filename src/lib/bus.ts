const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";
const INTERNAL_SECRET = process.env.REALTIME_INTERNAL_SECRET ?? "";

/**
 * Fire-and-forget broadcast to the realtime service.
 * The database is the source of truth — clients reconcile via snapshot
 * fetch if a broadcast is missed.
 */
export async function emitToMatch(
  matchId: string,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    await fetch(`${REALTIME_URL}/internal/emit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ matchId, type, payload }),
      cache: "no-store",
    });
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
  try {
    await fetch(`${REALTIME_URL}/internal/emit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ channel, type, payload }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[bus] channel emit failed", channel, type, err);
  }
}
