"use client";
// Tiny JSON fetch wrapper for the app's own API routes.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export class ClientApiError extends Error {
  code: string;
  constructor(message: string, code = "ERROR") {
    super(message);
    this.code = code;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new ClientApiError(json.error.message, json.error.code);
  return json.data;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new ClientApiError(json.error.message, json.error.code);
  return json.data;
}
