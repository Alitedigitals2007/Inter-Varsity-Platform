"use client";

// Device → DB media upload. Downscales any image in-browser to at most
// 512 px on the long edge (WebP, ~90% quality) so a whole show's worth of
// logos stays small enough for Postgres bytea on Neon or a venue laptop.

export type UploadedMedia = { id: string; url: string; bytes: number };

export async function uploadImage(
  file: File,
  label?: string
): Promise<UploadedMedia> {
  const { dataBase64, mime, width, height } = await downscale(file);
  const res = await fetch("/api/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label, mime, dataBase64, width, height }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    error?: { message?: string };
    data?: UploadedMedia;
  };
  if (!json.ok || !json.data) {
    throw new Error(json.error?.message ?? "Upload failed");
  }
  return json.data;
}

async function downscale(
  file: File,
  maxEdge = 512
): Promise<{ dataBase64: string; mime: string; width: number; height: number }> {
  if (file.type === "image/svg+xml") {
    // SVG scales anyway — pass through untouched (server caps size)
    const text = await file.text();
    return {
      dataBase64: btoa(unescape(encodeURIComponent(text))),
      mime: "image/svg+xml",
      width: maxEdge,
      height: maxEdge,
    };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", 0.9)
  );
  if (!blob) throw new Error("Could not process image");

  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { dataBase64: btoa(binary), mime: "image/webp", width, height };
}
