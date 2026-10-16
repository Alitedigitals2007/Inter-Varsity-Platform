import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  brandName: z.string().min(1).max(120),
  website: z.string().max(300).nullable().optional(),
  tier: z.string().max(40).nullable().optional(),
  logoMediaId: z.string().max(40).nullable().optional(),
});

export const GET = handle(async () => {
  await requireStaff();
  const sponsors = await prisma.sponsor.findMany({
    orderBy: { brandName: "asc" },
    select: {
      id: true,
      brandName: true,
      logoUrl: true,
      website: true,
      tier: true,
      active: true,
    },
  });
  return ok({ sponsors });
});

export const POST = handle(async (req) => {
  await requireStaff();
  const input = createSchema.parse(await req.json());
  const sponsor = await prisma.sponsor.create({
    data: {
      brandName: input.brandName.trim(),
      website: input.website ?? null,
      tier: input.tier ?? null,
      ...(input.logoMediaId
        ? { logoMediaId: input.logoMediaId, logoUrl: `/api/media/${input.logoMediaId}` }
        : {}),
    },
    select: { id: true, brandName: true, logoUrl: true },
  });
  return ok({ sponsor });
});
