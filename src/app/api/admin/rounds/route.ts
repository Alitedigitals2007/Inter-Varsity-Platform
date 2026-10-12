import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

const createSchema = z.object({
  competitionId: z.string().min(1),
  name: z.string().min(1).max(120),
  orderIndex: z.number().int().min(0).optional(),
  leaderboardEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());

  const competition = await prisma.competition.findUnique({
    where: { id: input.competitionId },
    include: { rounds: { orderBy: { orderIndex: "desc" }, take: 1 } },
  });
  if (!competition) throw new ApiError(404, "Competition not found", "NOT_FOUND");

  const orderIndex =
    input.orderIndex ?? (competition.rounds[0]?.orderIndex ?? -1) + 1;

  const round = await prisma.round.create({
    data: {
      competitionId: input.competitionId,
      name: input.name.trim(),
      orderIndex,
      config: (input.config ?? {}) as object,
      leaderboardEnabled: input.leaderboardEnabled ?? true,
      requiresApproval: input.requiresApproval ?? false,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "ROUND_CREATE",
      entityType: "Round",
      entityId: round.id,
      after: { name: round.name, orderIndex: round.orderIndex },
    },
  });
  return ok({ round });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  orderIndex: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "READY", "LIVE", "COMPLETED"]).optional(),
  leaderboardEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});

export const PATCH = handle(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id query parameter required", "VALIDATION");
  const input = patchSchema.parse(await req.json());

  const before = await prisma.round.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Round not found", "NOT_FOUND");

  const round = await prisma.round.update({ where: { id }, data: input });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "ROUND_UPDATE",
      entityType: "Round",
      entityId: id,
      before: { name: before.name, status: before.status },
      after: { name: round.name, status: round.status },
    },
  });
  return ok({ round });
});
