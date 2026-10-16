type Ctx = { params: Promise<{ id: string }> };

// Public: venue screens and school devices load logos by URL.

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{8,32}$/i.test(id)) {
    return new Response("Bad id", { status: 400 });
  }
  const { prisma } = await import("@/lib/db");
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) return new Response("Not found", { status: 404 });

  const body = new Uint8Array(media.data);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": media.mime,
      "content-length": String(body.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
