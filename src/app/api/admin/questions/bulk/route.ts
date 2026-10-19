import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).max(500).optional(),
  /** Delete every question that is not used in any match. */
  all: z.boolean().optional(),
});

/** Bulk delete questions from the bank. Questions already assigned to a
 *  match are skipped (reported back) instead of failing the whole batch. */
export const DELETE = handle(async (req) => {
  const admin = await requireAdmin();
  const { ids, all } = bulkSchema.parse(await req.json());

  if (!all && (!ids || ids.length === 0)) {
    throw new ApiError(400, "Provide question ids or set all: true", "VALIDATION");
  }

  const eligible = { matchQuestions: { none: {} } } as const;
  const where = all
    ? eligible
    : { id: { in: ids }, ...eligible };

  const deleted = await prisma.question.deleteMany({ where });

  const blockedWhere = all
    ? { matchQuestions: { some: {} } }
    : { id: { in: ids ?? [] }, matchQuestions: { some: {} } };
  const skipped = await prisma.question.count({ where: blockedWhere });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "QUESTION_BULK_DELETE",
      entityType: "Question",
      after: {
        requested: all ? deleted.count + skipped : (ids?.length ?? 0),
        deleted: deleted.count,
        skipped,
      },
    },
  });

  return ok({ deleted: deleted.count, skipped });
});
