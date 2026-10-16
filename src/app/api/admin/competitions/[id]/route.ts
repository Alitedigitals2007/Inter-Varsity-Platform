import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { orderIndex: "asc" },
        include: {
          matches: {
            orderBy: { matchNumber: "asc" },
            include: {
              schools: { include: { school: true }, orderBy: { turnOrder: "asc" } },
              _count: { select: { questions: true } },
            },
          },
        },
      },
      accessCodes: {
        include: { school: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!competition) throw new ApiError(404, "Competition not found", "NOT_FOUND");
  return ok({ competition });
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  edition: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  organizer: z.string().max(200).nullable().optional(),
  venue: z.string().max(200).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  timeZone: z.string().max(60).optional(),
  language: z.string().max(10).optional(),
  status: z.enum(["DRAFT", "READY", "LIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
  publicViewing: z.boolean().optional(),
  logoMediaId: z.string().max(40).nullable().optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = patchSchema.parse(await req.json());

  const before = await prisma.competition.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Competition not found", "NOT_FOUND");

  const competition = await prisma.competition.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.edition !== undefined ? { edition: input.edition } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.organizer !== undefined ? { organizer: input.organizer } : {}),
      ...(input.venue !== undefined ? { venue: input.venue } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.publicViewing !== undefined ? { publicViewing: input.publicViewing } : {}),
      ...(input.logoMediaId !== undefined
        ? input.logoMediaId
          ? { logoMediaId: input.logoMediaId, logoUrl: `/api/media/${input.logoMediaId}` }
          : { logoMediaId: null, logoUrl: null }
        : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "COMPETITION_UPDATE",
      entityType: "Competition",
      entityId: id,
      before: { name: before.name, status: before.status },
      after: { name: competition.name, status: competition.status },
    },
  });
  return ok({ competition });
});
