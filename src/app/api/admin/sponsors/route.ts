import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  brandName: z.string().min(1).max(120),
  website: z.string().max(300).nullable().optional(),
  tier: z.string().max(40).nullable().optional(),
  logoMediaId: z.string().max(40).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  brandColors: z.object({
    primary: z.string().max(20).nullable().optional(),
    secondary: z.string().max(20).nullable().optional(),
    accent: z.string().max(20).nullable().optional(),
  }).nullable().optional(),
});

const reorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), positionOrder: z.number() })),
});

export const GET = handle(async () => {
  await requireStaff();
  const sponsors = await prisma.sponsor.findMany({
    orderBy: [{ positionOrder: "asc" }, { brandName: "asc" }],
    select: {
      id: true,
      brandName: true,
      logoUrl: true,
      website: true,
      description: true,
      brandColors: true,
      tier: true,
      active: true,
      positionOrder: true,
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
      description: input.description ?? null,
      brandColors: input.brandColors ?? null,
      ...(input.logoMediaId
        ? { logoMediaId: input.logoMediaId, logoUrl: `/api/media/${input.logoMediaId}` }
        : {}),
    },
    select: { id: true, brandName: true, logoUrl: true },
  });
  return ok({ sponsor });
});

export const PATCH = handle(async (req) => {
  await requireStaff();
  const { orders } = reorderSchema.parse(await req.json());
  await Promise.all(
    orders.map((o) =>
      prisma.sponsor.update({
        where: { id: o.id },
        data: { positionOrder: o.positionOrder },
      })
    )
  );
  const sponsors = await prisma.sponsor.findMany({
    orderBy: [{ positionOrder: "asc" }, { brandName: "asc" }],
    select: {
      id: true,
      brandName: true,
      logoUrl: true,
      website: true,
      description: true,
      brandColors: true,
      tier: true,
      active: true,
      positionOrder: true,
    },
  });
  return ok({ sponsors });
});
