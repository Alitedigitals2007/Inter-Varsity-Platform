// Ably REST transport over native fetch — no SDK dependency.
// Used server-side only (bus + token minting). The browser talks to Ably
// directly via the CDN-loaded realtime SDK, or falls back to polling.

const ABLY_REST = "https://rest.ably.io";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h — client re-auths well before expiry

export function ablyEnabled(): boolean {
  return Boolean(process.env.ABLY_API_KEY);
}

function authHeader(): string {
  return "Basic " + Buffer.from(process.env.ABLY_API_KEY ?? "").toString("base64");
}

async function ablyFetch(path: string, body: unknown): Promise<Response> {
  return fetch(`${ABLY_REST}${path}`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
}

/** Publish one message to a channel. Channel/event names are URL-safe. */
export async function ablyPublish(
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  const res = await ablyFetch(
    `/channels/${encodeURIComponent(channel)}/messages`,
    { name: event, data }
  );
  if (!res.ok) {
    throw new Error(`ably publish ${res.status}: ${await res.text()}`);
  }
}

/** Mint a browser token with the given capability map. */
export async function ablyRequestToken(
  capability: Record<string, string[]>,
  clientId?: string
): Promise<{ token: string; expiresAt: number }> {
  const res = await ablyFetch("/auth/requestToken", {
    capability,
    ttl: TOKEN_TTL_MS,
    ...(clientId ? { clientId } : {}),
  });
  if (!res.ok) {
    throw new Error(`ably token ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { token: string; ttl: number };
  return { token: json.token, expiresAt: Date.now() + (json.ttl ?? TOKEN_TTL_MS) };
}
