import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIdentity, type Identity } from "./auth";
import { ApiError } from "./errors";

export { ApiError };

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, message: string, code = "ERROR") {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

type Handler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx
) => Promise<Response> | Response;

/** Wraps a route handler with uniform error handling. */
export function handle<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, err.message, err.code);
      if (err instanceof z.ZodError) {
        const first = err.issues[0];
        const path = first?.path?.join(".") || "input";
        return fail(400, `${path}: ${first?.message ?? "invalid"}`, "VALIDATION");
      }
      console.error("[api] unhandled error", err);
      return fail(500, "Internal server error", "INTERNAL");
    }
  };
}

export async function requireIdentity(): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) throw new ApiError(401, "Not signed in", "UNAUTHENTICATED");
  return identity;
}

export async function requireStaff(
  role?: "ADMIN" | "GAME_MASTER"
): Promise<Extract<Identity, { kind: "STAFF" }>> {
  const identity = await requireIdentity();
  if (identity.kind !== "STAFF") {
    throw new ApiError(403, "Staff access required", "FORBIDDEN");
  }
  if (role && identity.role !== role && identity.role !== "ADMIN") {
    throw new ApiError(403, `${role} access required`, "FORBIDDEN");
  }
  return identity;
}

export async function requireAdmin() {
  return requireStaff("ADMIN");
}

// ── Simple in-memory rate limiter (per server instance) ──────────
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;

function sweepBuckets(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // opportunistic eviction so the map cannot grow without bound
    if (buckets.size >= MAX_BUCKETS) sweepBuckets(now);
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw new ApiError(429, "Too many requests, slow down", "RATE_LIMITED");
  }
}

/** Reads a numeric query parameter, falling back on NaN/out-of-range input. */
export function numericParam(
  req: NextRequest,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = new URL(req.url).searchParams.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function clientKey(req: NextRequest, name: string): string {
  // Prefer the proxy-set single-value header; fall back to the CLOSEST hop of
  // x-forwarded-for (the last entry is appended by our own proxy, the first
  // is client-controlled and spoofable).
  const real = req.headers.get("x-real-ip")?.trim();
  let ip = real || "local";
  if (!real) {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) {
      const parts = fwd
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      ip = parts[parts.length - 1] ?? "local";
    }
  }
  return `${name}:${ip.slice(0, 64)}`;
}
