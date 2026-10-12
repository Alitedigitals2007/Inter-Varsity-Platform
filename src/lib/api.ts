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

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw new ApiError(429, "Too many requests, slow down", "RATE_LIMITED");
  }
}

export function clientKey(req: NextRequest, name: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "local";
  return `${name}:${ip}`;
}
