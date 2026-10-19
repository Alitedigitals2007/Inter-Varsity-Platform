import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).max(500).optional(),
  /** Delete every question that is not used in any match. */
  all: z.boolean().optional(),
  /** Also delete question selections in matches. */
  cascade: z.boolean().optional(),
});

export const DELETE = handle(async (req) => {
  const admin = await requireAdmin();
  const { ids, all, cascade = false } = bulkSchema.parse(await req.json());

  if (!all && (!ids || ids.length === 0)) {
    throw new ApiError(400, "Provide question ids or set all: true", "VALIDATION");
  }

  // Get affected match questions if cascading
  if (cascade) {
    const matchQueries = await prisma.matchQuestion.findMany({
      where: ids ? { questionId: { in: ids } } : {},
      select: { matchId: true },
    });
    const matchIds = [...new Set(matchQueries.map(mq => mq.matchId))];
    
    // Verify none of the matches are LIVE
    const liveMatches = await prisma.match.findMany({
      where: { id: { in: matchIds }, status: "LIVE" },
    });
    if (liveMatches.length > 0) {
      throw new ApiError(409, "Cannot delete questions from a live match", "INVALID_PHASE");
    }
  }

  // First delete match questions if cascading
  if (cascade) {
    await prisma.matchQuestion.deleteMany({
      where: ids
        ? { questionId: { in: ids } }
        : {},
    });
  }

  // Now delete questions
  const eligible = cascade ? {} : { matchQuestions: { none: {} } };
  const where = all
    ? eligible
    : { id: { in: ids! }, ...eligible };

  const deleted = await prisma.question.deleteMany({ where });

  const skipped = cascade ? 0 : await prisma.question.count({
    where: all
      ? { matchQuestions: { some: {} } }
      : { id: { in: ids! }, matchQuestions: { some: {} } },
  });

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
        cascade,
      },
    },
  });

  return ok({ deleted: deleted.count, skipped });
});
