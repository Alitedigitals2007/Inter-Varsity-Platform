import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { generateAccessCode } from "@/lib/codes";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const GET = handle(async (req) => {
  await requireAdmin();
  const competitionId = new URL(req.url).searchParams.get("competitionId");
  const codes = await prisma.schoolAccessCode.findMany({
    where: competitionId ? { competitionId } : undefined,
    include: { school: true, competition: { select: { name: true } }, match: { select: { matchNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ codes });
});

const createSchema = z.object({
  schoolId: z.string().min(1),
  competitionId: z.string().min(1),
  matchId: z.string().min(1).optional(),
  maxDevices: z.number().int().min(1).max(20).optional(),
  expiresAt: z.coerce.date().optional(),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());

  const [school, competition] = await Promise.all([
    prisma.school.findUnique({ where: { id: input.schoolId } }),
    prisma.competition.findUnique({ where: { id: input.competitionId } }),
  ]);
  if (!school) throw new ApiError(404, "School not found", "NOT_FOUND");
  if (!competition) throw new ApiError(404, "Competition not found", "NOT_FOUND");
  if (input.matchId) {
    const match = await prisma.match.findUnique({ where: { id: input.matchId } });
    if (!match || match.competitionId !== competition.id) {
      throw new ApiError(400, "Match does not belong to this competition", "VALIDATION");
    }
  }

  // retry on the (unlikely) collision of an 8-char code
  let code = generateAccessCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.schoolAccessCode.findUnique({ where: { code } });
    if (!clash) break;
    code = generateAccessCode();
  }

  const accessCode = await prisma.schoolAccessCode.create({
    data: {
      code,
      schoolId: input.schoolId,
      competitionId: input.competitionId,
      matchId: input.matchId ?? null,
      maxDevices: input.maxDevices ?? 1,
      expiresAt: input.expiresAt ?? null,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "ACCESS_CODE_CREATE",
      entityType: "SchoolAccessCode",
      entityId: accessCode.id,
      after: { code, schoolId: input.schoolId, competitionId: input.competitionId },
    },
  });
  return ok({ accessCode });
});

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["REVOKE", "REGENERATE", "EXPIRE"]),
});

export const PATCH = handle(async (req) => {
  const admin = await requireAdmin();
  const input = patchSchema.parse(await req.json());

  const existing = await prisma.schoolAccessCode.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, "Access code not found", "NOT_FOUND");

  let data: Record<string, unknown> = {};
  let action = "";
  switch (input.action) {
    case "REVOKE":
      data = { status: "REVOKED", revokedAt: new Date() };
      action = "ACCESS_CODE_REVOKE";
      break;
    case "EXPIRE":
      data = { status: "EXPIRED", expiresAt: new Date() };
      action = "ACCESS_CODE_EXPIRE";
      break;
    case "REGENERATE": {
      let code = generateAccessCode();
      for (let i = 0; i < 5; i++) {
        const clash = await prisma.schoolAccessCode.findUnique({ where: { code } });
        if (!clash) break;
        code = generateAccessCode();
      }
      data = { code, status: "ACTIVE", revokedAt: null };
      action = "ACCESS_CODE_REGENERATE";
      break;
    }
  }

  const accessCode = await prisma.schoolAccessCode.update({ where: { id: input.id }, data });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action,
      entityType: "SchoolAccessCode",
      entityId: existing.id,
      before: { code: existing.code, status: existing.status },
      after: data as Prisma.InputJsonValue,
    },
  });
  return ok({ accessCode });
});
