import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { parseMatchConfig } from "@/lib/engine/config";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      competition: true,
      round: true,
      schools: { include: { school: true }, orderBy: { turnOrder: "asc" } },
      questions: {
        include: {
          question: { include: { category: true, options: { orderBy: { orderIndex: "asc" } } } },
        },
      },
    },
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  return ok({ match, effectiveConfig: parseMatchConfig(match.config) });
});

const assignSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1).max(500),
  /** Optional overrides applied to every assigned question. */
  pointValue: z.number().int().min(0).max(1000).optional(),
  timeLimitSec: z.number().int().min(1).max(600).optional(),
  bonusPoints: z.number().int().min(0).max(1000).optional(),
});

/** Assign questions from the permanent bank into a match. */
export const POST = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = assignSchema.parse(await req.json());

  const match = await prisma.match.findUnique({
    where: { id },
    include: { round: true },
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  if (match.status === "LIVE" || match.status === "COMPLETED") {
    throw new ApiError(409, "Cannot change questions on a live match", "INVALID_PHASE");
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: input.questionIds }, active: true },
  });
  if (questions.length === 0) throw new ApiError(400, "No valid questions selected", "VALIDATION");

  const already = await prisma.matchQuestion.findMany({
    where: { matchId: id },
    select: { questionId: true },
  });
  const used = new Set(already.map((q) => q.questionId));
  const fresh = questions.filter((q) => !used.has(q.id));

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const q of fresh) {
      rows.push(
        await tx.matchQuestion.create({
          data: {
            matchId: id,
            questionId: q.id,
            pointValue: input.pointValue ?? q.defaultPoints,
            timeLimitSec: input.timeLimitSec ?? q.defaultTimeLimitSec,
            bonusPoints: input.bonusPoints ?? q.bonusPoints,
          },
        })
      );
    }
    return rows;
  });

  // A hand-edited board overrides the setup wizard's per-category plan —
  // clear it so the publish checklist validates the existing questions only.
  const config = parseMatchConfig(match.config);
  const planCleared = config.questionPlan.length > 0;
  if (planCleared) {
    config.questionPlan = [];
    await prisma.match.update({ where: { id }, data: { config: config as unknown as object } });
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "MATCH_QUESTIONS_ASSIGN",
      entityType: "Match",
      entityId: id,
      after: { added: created.length, skippedDuplicates: questions.length - fresh.length, questionPlanCleared: planCleared },
      matchId: id,
    },
  });
  return ok({ added: created.length, skippedDuplicates: questions.length - fresh.length, questionPlanCleared: planCleared });
});

const removeSchema = z.object({ matchQuestionIds: z.array(z.string().min(1)).min(1) });

/** Remove (unassign) available questions from a match. */
export const DELETE = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = removeSchema.parse(await req.json());

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");

  const removed = await prisma.matchQuestion.deleteMany({
    where: {
      matchId: id,
      id: { in: input.matchQuestionIds },
      state: { in: ["AVAILABLE", "DISABLED"] },
    },
  });

  // Removing questions invalidates the setup wizard's per-category plan.
  const config = parseMatchConfig(match.config);
  const planCleared = config.questionPlan.length > 0;
  if (planCleared) {
    config.questionPlan = [];
    await prisma.match.update({ where: { id }, data: { config: config as unknown as object } });
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "MATCH_QUESTIONS_REMOVE",
      entityType: "Match",
      entityId: id,
      after: { removed: removed.count, questionPlanCleared: planCleared },
      matchId: id,
    },
  });
  return ok({ removed: removed.count, questionPlanCleared: planCleared });
});
