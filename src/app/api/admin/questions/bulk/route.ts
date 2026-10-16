import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

const bulkSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

/** Bulk delete questions from the bank. Questions already assigned to a
 *  match are skipped (reported back) instead of failing the whole batch. */
export const DELETE = handle(async (req) => {
  const admin = await requireAdmin();
  const { ids } = bulkSchema.parse(await req.json());

  let deleted = 0;
  const skipped: number[] = [];

  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      try {
        await tx.question.delete({ where: { id } });
        deleted += 1;
      } catch {
        // FK restriction (used in a match) — leave it in the bank
        skipped.push(ids.indexOf(id) + 1);
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "QUESTION_BULK_DELETE",
      entityType: "Question",
      after: { requested: ids.length, deleted, skipped: skipped.length },
    },
  });

  return ok({ deleted, skipped });
});
