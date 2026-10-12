import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const GET = handle(async () => {
  await requireAdmin();
  const competitions = await prisma.competition.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { rounds: true, matches: true } },
    },
  });
  return ok({ competitions });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  edition: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  organizer: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  startsAt: z.coerce.date().optional(),
  timeZone: z.string().max(60).optional(),
  language: z.string().max(10).optional(),
  publicViewing: z.boolean().optional(),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());
  const competition = await prisma.competition.create({
    data: {
      name: input.name.trim(),
      edition: input.edition || null,
      description: input.description || null,
      organizer: input.organizer || null,
      venue: input.venue || null,
      startsAt: input.startsAt ?? null,
      timeZone: input.timeZone ?? "UTC",
      language: input.language ?? "en",
      publicViewing: input.publicViewing ?? true,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "COMPETITION_CREATE",
      entityType: "Competition",
      entityId: competition.id,
      after: { name: competition.name },
    },
  });
  return ok({ competition });
});
