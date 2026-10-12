import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  text: z.string().min(1).max(4000).optional(),
  categoryId: z.string().min(1).optional(),
  topic: z.string().max(200).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  answerKey: z.string().max(1000).nullable().optional(),
  acceptedAlternatives: z.array(z.string().max(500)).max(50).optional(),
  numericTolerance: z.number().min(0).nullable().optional(),
  explanation: z.string().max(4000).nullable().optional(),
  judgeNotes: z.string().max(4000).nullable().optional(),
  defaultPoints: z.number().int().min(0).max(1000).optional(),
  defaultTimeLimitSec: z.number().int().min(1).max(600).nullable().optional(),
  isBonus: z.boolean().optional(),
  bonusPoints: z.number().int().min(0).max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = patchSchema.parse(await req.json());

  const before = await prisma.question.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Question not found", "NOT_FOUND");

  const question = await prisma.question.update({
    where: { id },
    data: {
      ...(input.text !== undefined ? { text: input.text.trim() } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.topic !== undefined ? { topic: input.topic } : {}),
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
      ...(input.answerKey !== undefined ? { answerKey: input.answerKey } : {}),
      ...(input.acceptedAlternatives !== undefined ? { acceptedAlternatives: input.acceptedAlternatives } : {}),
      ...(input.numericTolerance !== undefined ? { numericTolerance: input.numericTolerance } : {}),
      ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
      ...(input.judgeNotes !== undefined ? { judgeNotes: input.judgeNotes } : {}),
      ...(input.defaultPoints !== undefined ? { defaultPoints: input.defaultPoints } : {}),
      ...(input.defaultTimeLimitSec !== undefined ? { defaultTimeLimitSec: input.defaultTimeLimitSec } : {}),
      ...(input.isBonus !== undefined ? { isBonus: input.isBonus } : {}),
      ...(input.bonusPoints !== undefined ? { bonusPoints: input.bonusPoints } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "QUESTION_UPDATE",
      entityType: "Question",
      entityId: id,
      before: { text: before.text, active: before.active },
      after: { text: question.text, active: question.active },
    },
  });
  return ok({ question });
});

/** Soft-delete: deactivates unless the question was never used in a match. */
export const DELETE = handle<Ctx>(async (_req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: { matchQuestions: { select: { id: true }, take: 1 } },
  });
  if (!question) throw new ApiError(404, "Question not found", "NOT_FOUND");

  if (question.matchQuestions.length === 0) {
    await prisma.question.delete({ where: { id } });
  } else {
    await prisma.question.update({ where: { id }, data: { active: false } });
  }
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "QUESTION_DELETE",
      entityType: "Question",
      entityId: id,
      before: { text: question.text },
    },
  });
  return ok({ deleted: true });
});
