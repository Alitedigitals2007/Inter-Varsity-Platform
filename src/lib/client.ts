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

/** Parses a JSON envelope, tolerating non-JSON (HTML error pages, 502s). */
async function parseResponse<T>(res: Response): Promise<T> {
  let json: ApiResult<T> | null = null;
  try {
    json = (await res.json()) as ApiResult<T>;
  } catch {
    json = null;
  }
  if (!json) {
    throw new ClientApiError(
      `Server error (${res.status}) — please retry`,
      "HTTP_ERROR"
    );
  }
  if (!json.ok) throw new ClientApiError(json.error.message, json.error.code);
  return json.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  return parseResponse<T>(res);
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
  return parseResponse<T>(res);
}
