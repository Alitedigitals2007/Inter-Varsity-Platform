import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const brandColorsSchema = z
  .object({
    primary: z.string().max(20).optional(),
    secondary: z.string().max(20).optional(),
    accent: z.string().max(20).optional(),
  })
  .nullable();

const patchSchema = z.object({
  brandName: z.string().min(1).max(120).optional(),
  website: z.string().max(300).nullable().optional(),
  description: z.string().max(600).nullable().optional(),
  brandColors: brandColorsSchema.optional(),
  tier: z.string().max(40).nullable().optional(),
  logoMediaId: z.string().max(40).nullable().optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  await requireStaff();
  const { id } = await ctx.params;
  const input = patchSchema.parse(await req.json());

  const before = await prisma.sponsor.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Sponsor not found", "NOT_FOUND");

  const sponsor = await prisma.sponsor.update({
    where: { id },
    data: {
      ...(input.brandName !== undefined ? { brandName: input.brandName.trim() } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.brandColors !== undefined
        ? {
            brandColors: input.brandColors
              ? (JSON.parse(JSON.stringify(input.brandColors)) as Prisma.InputJsonValue)
              : Prisma.DbNull,
          }
        : {}),
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      // setting a logo also mirrors the public URL; clearing resets both
      ...(input.logoMediaId !== undefined
        ? input.logoMediaId
          ? { logoMediaId: input.logoMediaId, logoUrl: `/api/media/${input.logoMediaId}` }
          : { logoMediaId: null, logoUrl: null }
        : {}),
    },
    select: {
      id: true,
      brandName: true,
      logoUrl: true,
      website: true,
      description: true,
      brandColors: true,
      tier: true,
      active: true,
    },
  });
  return ok({ sponsor });
});

export const DELETE = handle<Ctx>(async (_req, ctx) => {
  await requireStaff();
  const { id } = await ctx.params;
  await prisma.sponsor.delete({ where: { id } }).catch(() => null);
  return ok({ deleted: true });
});
