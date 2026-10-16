import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

// Live-show media: logos uploaded from the admin's device, stored as bytes
// in Postgres (works online on Neon and offline on a venue laptop alike).
// Images are downscaled client-side before upload; ~512 KB ceiling.

const MAX_BASE64 = 750_000; // ≈ 560 KB binary

const uploadSchema = z.object({
  label: z.string().max(120).optional(),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  dataBase64: z.string().min(16).max(MAX_BASE64),
  width: z.number().int().min(1).max(8192).optional(),
  height: z.number().int().min(1).max(8192).optional(),
});

export const POST = handle(async (req) => {
  const staff = await requireStaff();
  const input = uploadSchema.parse(await req.json());

  const data = Buffer.from(input.dataBase64, "base64");
  if (data.length < 16) throw new ApiError(400, "Empty image", "VALIDATION");

  const media = await prisma.media.create({
    data: {
      label: input.label ?? null,
      mime: input.mime,
      bytes: data.length,
      width: input.width ?? null,
      height: input.height ?? null,
      data,
      createdById: staff.userId,
    },
    select: { id: true },
  });

  return ok({ id: media.id, url: `/api/media/${media.id}`, bytes: data.length });
});
