import { handle, numericParam, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId") ?? undefined;
  const search = url.searchParams.get("q") ?? undefined;
  const take = numericParam(req, "take", 100, 1, 500);

  const questions = await prisma.question.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { text: { contains: search, mode: "insensitive" } } : {}),
    },
    include: {
      category: true,
      options: { orderBy: { orderIndex: "asc" } },
      _count: { select: { matchQuestions: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return ok({ questions });
});

const optionSchema = z.object({ text: z.string().min(1).max(500), isCorrect: z.boolean() });

const createSchema = z.object({
  text: z.string().min(1).max(4000),
  categoryId: z.string().min(1),
  topic: z.string().max(200).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT", "NUMERICAL", "SUBJECTIVE"]),
  answerKey: z.string().max(1000).optional(),
  acceptedAlternatives: z.array(z.string().max(500)).max(50).optional(),
  numericTolerance: z.number().min(0).optional(),
  explanation: z.string().max(4000).optional(),
  judgeNotes: z.string().max(4000).optional(),
  defaultPoints: z.number().int().min(0).max(1000).optional(),
  defaultTimeLimitSec: z.number().int().min(1).max(600).optional(),
  isBonus: z.boolean().optional(),
  bonusPoints: z.number().int().min(0).max(1000).optional(),
  source: z.string().max(300).optional(),
  options: z.array(optionSchema).max(10).optional(),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());

  if (input.type === "MULTIPLE_CHOICE") {
    if (!input.options || input.options.filter((o) => o.isCorrect).length !== 1) {
      throw new ApiError(400, "Multiple choice needs exactly one correct option", "VALIDATION");
    }
  }

  const question = await prisma.$transaction(async (tx) => {
    const q = await tx.question.create({
      data: {
        text: input.text.trim(),
        categoryId: input.categoryId,
        topic: input.topic || null,
        difficulty: input.difficulty ?? null,
        type: input.type,
        answerKey: input.answerKey?.trim() || null,
        acceptedAlternatives: input.acceptedAlternatives ?? [],
        numericTolerance: input.numericTolerance ?? null,
        explanation: input.explanation || null,
        judgeNotes: input.judgeNotes || null,
        defaultPoints: input.defaultPoints ?? 10,
        defaultTimeLimitSec: input.defaultTimeLimitSec ?? null,
        isBonus: input.isBonus ?? false,
        bonusPoints: input.bonusPoints ?? null,
        source: input.source || null,
        createdById: admin.userId,
      },
    });
    if (input.options?.length) {
      await tx.questionOption.createMany({
        data: input.options.map((o, i) => ({
          questionId: q.id,
          text: o.text.trim(),
          isCorrect: o.isCorrect,
          orderIndex: i,
        })),
      });
    }
    return q;
  });

  return ok({ question });
});
