import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import {
  matchConfigPatchSchema,
  mergeMatchConfigPatch,
  parseMatchConfig,
} from "@/lib/engine/config";
import { z } from "zod";

export const GET = handle(async (req) => {
  await requireAdmin();
  const competitionId = new URL(req.url).searchParams.get("competitionId");
  const matches = await prisma.match.findMany({
    where: competitionId ? { competitionId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      competition: { select: { name: true, edition: true } },
      round: { select: { name: true } },
      schools: { include: { school: { select: { name: true, abbreviation: true } } }, orderBy: { turnOrder: "asc" } },
      _count: { select: { questions: true } },
    },
  });
  return ok({ matches });
});

export const DELETE = handle(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id query parameter required", "VALIDATION");

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  if (match.status === "LIVE" || match.status === "COMPLETED") {
    throw new ApiError(409, "Cannot delete a live or completed match", "INVALID_PHASE");
  }

  await prisma.match.delete({ where: { id } }).catch(() => null);

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "MATCH_DELETE",
      entityType: "Match",
      entityId: id,
      matchId: id,
    },
  });
  return ok({ deleted: true });
});

const createSchema = z.object({
  roundId: z.string().min(1),
  matchNumber: z.number().int().min(1).default(1),
  schoolIds: z.array(z.string().min(1)).min(1).max(32),
  selectionMethod: z.enum(["BOARD", "CATEGORY_VALUE", "CATEGORY_RANDOM", "GM_ASSIGNED"]).optional(),
  config: matchConfigPatchSchema.optional(),
});

/**
 * Creates a match with its participating schools (turn order = array order).
 * Questions are assigned afterwards via POST /api/admin/matches/[id]/questions.
 */
export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());

  const round = await prisma.round.findUnique({ where: { id: input.roundId } });
  if (!round) throw new ApiError(404, "Round not found", "NOT_FOUND");

  const schools = await prisma.school.findMany({
    where: { id: { in: input.schoolIds }, active: true },
  });
  if (schools.length !== new Set(input.schoolIds).size) {
    throw new ApiError(400, "One or more schools are unknown or inactive", "VALIDATION");
  }

  const config = parseMatchConfig(input.config ?? {});
  const existing = await prisma.match.count({ where: { roundId: input.roundId } });

  const match = await prisma.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        competitionId: round.competitionId,
        roundId: round.id,
        matchNumber: input.matchNumber || existing + 1,
        selectionMethod: input.selectionMethod ?? config.selection.method,
        config: config as object,
        schools: {
          create: input.schoolIds.map((schoolId, i) => ({
            schoolId,
            turnOrder: i,
          })),
        },
      },
    });
    return m;
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "MATCH_CREATE",
      entityType: "Match",
      entityId: match.id,
      after: { matchNumber: match.matchNumber, schools: input.schoolIds.length },
      matchId: match.id,
    },
  });
  return ok({ match });
});

const patchSchema = z.object({
  matchNumber: z.number().int().min(1).optional(),
  selectionMethod: z.enum(["BOARD", "CATEGORY_VALUE", "CATEGORY_RANDOM", "GM_ASSIGNED"]).optional(),
  /** Reorders/changes participating schools. Only allowed before the match starts. */
  schoolIds: z.array(z.string().min(1)).min(1).max(32).optional(),
  config: matchConfigPatchSchema.optional(),
});

export const PATCH = handle(async (req) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id query parameter required", "VALIDATION");
  const input = patchSchema.parse(await req.json());

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  if (match.status === "LIVE" || match.status === "COMPLETED") {
    throw new ApiError(409, "A live or completed match cannot be reconfigured", "INVALID_PHASE");
  }

  await prisma.$transaction(async (tx) => {
    if (input.schoolIds) {
      const schools = await tx.school.findMany({
        where: { id: { in: input.schoolIds }, active: true },
      });
      if (schools.length !== new Set(input.schoolIds).size) {
        throw new ApiError(400, "One or more schools are unknown or inactive", "VALIDATION");
      }
      await tx.matchSchool.deleteMany({ where: { matchId: id } });
      await tx.matchSchool.createMany({
        data: input.schoolIds.map((schoolId, i) => ({ matchId: id, schoolId, turnOrder: i })),
      });
    }
    await tx.match.update({
      where: { id },
      data: {
        ...(input.matchNumber !== undefined ? { matchNumber: input.matchNumber } : {}),
        ...(input.selectionMethod !== undefined ? { selectionMethod: input.selectionMethod } : {}),
        ...(input.config !== undefined
          ? { config: mergeMatchConfigPatch(match.config, input.config) as object }
          : {}),
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "MATCH_UPDATE",
      entityType: "Match",
      entityId: id,
      matchId: id,
      reason: "admin_reconfigure",
    },
  });
  const updated = await prisma.match.findUnique({ where: { id } });
  return ok({ match: updated });
});
