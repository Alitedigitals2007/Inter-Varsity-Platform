import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const GET = handle(async () => {
  await requireAdmin();
  const categories = await prisma.category.findMany({
    orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
    include: { _count: { select: { questions: true } } },
  });
  return ok({ categories });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
});

export const POST = handle(async (req) => {
  await requireAdmin();
  const input = createSchema.parse(await req.json());
  const category = await prisma.category.upsert({
    where: { name: input.name.trim() },
    create: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color || null,
    },
    update: {},
  });
  return ok({ category });
});

const reorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), orderIndex: z.number() })),
});

export const PATCH = handle(async (req) => {
  await requireAdmin();
  const { orders } = reorderSchema.parse(await req.json());
  await Promise.all(
    orders.map((o) =>
      prisma.category.update({
        where: { id: o.id },
        data: { orderIndex: o.orderIndex },
      })
    )
  );
  const categories = await prisma.category.findMany({
    orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
    include: { _count: { select: { questions: true } } },
  });
  return ok({ categories });
});
