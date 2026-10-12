import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Bulk import with validation + preview. The client first calls with
// `dryRun: true` to receive an error report, then again to save.

const rowSchema = z.object({
  text: z.string().min(1),
  category: z.string().min(1),
  topic: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT", "NUMERICAL", "SUBJECTIVE"]),
  answerKey: z.string().optional(),
  acceptedAlternatives: z.array(z.string()).optional(),
  numericTolerance: z.number().min(0).optional(),
  explanation: z.string().optional(),
  defaultPoints: z.number().int().min(0).max(1000).optional(),
  defaultTimeLimitSec: z.number().int().min(1).max(600).optional(),
  isBonus: z.boolean().optional(),
  bonusPoints: z.number().int().min(0).max(1000).optional(),
  options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })).optional(),
});

const bodySchema = z.object({
  dryRun: z.boolean().default(true),
  questions: z.array(rowSchema).min(1).max(500),
});

type Row = z.infer<typeof rowSchema>;

function validateRow(row: Row, index: number, existingTexts: Set<string>): string | null {
  const prefix = `Row ${index + 1}`;
  if (row.type === "MULTIPLE_CHOICE") {
    if (!row.options || row.options.length < 2) return `${prefix}: multiple choice needs at least 2 options`;
    if (row.options.filter((o) => o.isCorrect).length !== 1) return `${prefix}: exactly one option must be marked correct`;
  } else if (row.options?.length) {
    return `${prefix}: options are only allowed for multiple choice`;
  }
  if (row.type !== "MULTIPLE_CHOICE" && !row.answerKey) {
    return `${prefix}: an answer key is required for type ${row.type}`;
  }
  const normalized = row.text.trim().toLowerCase();
  if (existingTexts.has(normalized)) return `${prefix}: duplicate of an existing question`;
  return null;
}

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const { dryRun, questions } = bodySchema.parse(await req.json());

  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const categoryNames = new Set(categories.map((c) => c.name.toLowerCase()));

  const existing = await prisma.question.findMany({ select: { text: true } });
  const existingTexts = new Set(existing.map((q) => q.text.trim().toLowerCase()));

  // duplicates within the uploaded batch
  const seen = new Set<string>();
  const errors: string[] = [];
  const valid: Row[] = [];

  questions.forEach((row, i) => {
    const err = validateRow(row, i, existingTexts);
    if (err) {
      errors.push(err);
      return;
    }
    const normalized = row.text.trim().toLowerCase();
    if (seen.has(normalized)) {
      errors.push(`Row ${i + 1}: duplicate within this import batch`);
      return;
    }
    seen.add(normalized);
    if (!categoryNames.has(row.category.trim().toLowerCase())) {
      errors.push(`Row ${i + 1}: unknown category "${row.category}"`);
      return;
    }
    valid.push(row);
  });

  if (dryRun) {
    return ok({
      dryRun: true,
      total: questions.length,
      valid: valid.length,
      errors,
      imported: 0,
    });
  }

  if (errors.length > 0) {
    return ok({ dryRun: false, total: questions.length, valid: valid.length, errors, imported: 0 });
  }

  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  let imported = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of valid) {
      const category = categoryByName.get(row.category.trim().toLowerCase())!;
      await tx.question.create({
        data: {
          text: row.text.trim(),
          categoryId: category.id,
          topic: row.topic ?? null,
          difficulty: row.difficulty ?? null,
          type: row.type,
          answerKey: row.answerKey?.trim() || null,
          acceptedAlternatives: row.acceptedAlternatives ?? [],
          numericTolerance: row.numericTolerance ?? null,
          explanation: row.explanation ?? null,
          defaultPoints: row.defaultPoints ?? 10,
          defaultTimeLimitSec: row.defaultTimeLimitSec ?? null,
          isBonus: row.isBonus ?? false,
          bonusPoints: row.bonusPoints ?? null,
          createdById: admin.userId,
          options: row.options?.length
            ? {
                create: row.options.map((o, i) => ({
                  text: o.text.trim(),
                  isCorrect: o.isCorrect,
                  orderIndex: i,
                })),
              }
            : undefined,
        },
      });
      imported += 1;
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "QUESTION_IMPORT",
      entityType: "Question",
      after: { imported, categories: [...new Set(valid.map((r) => r.category))] },
    },
  });

  return ok({ dryRun: false, total: questions.length, valid: valid.length, errors, imported });
});
