import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).max(500).optional(),
  /** Delete every school that has never been used in a match. */
  all: z.boolean().optional(),
});

/**
 * Bulk delete schools. A school is only deletable when it is untouched by
 * gameplay: no match registration, no answers, no score events, and it is not
 * the active school of a live match. Anything else is skipped and reported.
 * Its access codes and device logins cascade.
 */
export const DELETE = handle(async (req) => {
  const admin = await requireAdmin();
  const { ids, all } = bulkSchema.parse(await req.json());

  if (!all && (!ids || ids.length === 0)) {
    throw new ApiError(400, "Provide school ids or set all: true", "VALIDATION");
  }

  const untouched = {
    matchSchools: { none: {} },
    answers: { none: {} },
    scoreEvents: { none: {} },
    activeMatches: { none: {} },
  } as const;

  const where = all ? untouched : { id: { in: ids }, ...untouched };
  const deleted = await prisma.school.deleteMany({ where });

  const blockedWhere = all
    ? { OR: [{ matchSchools: { some: {} } }, { answers: { some: {} } }, { scoreEvents: { some: {} } }, { activeMatches: { some: {} } }] }
    : {
        id: { in: ids ?? [] },
        OR: [{ matchSchools: { some: {} } }, { answers: { some: {} } }, { scoreEvents: { some: {} } }, { activeMatches: { some: {} } }],
      };
  const skipped = await prisma.school.count({ where: blockedWhere });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "SCHOOL_BULK_DELETE",
      entityType: "School",
      after: {
        requested: all ? deleted.count + skipped : (ids?.length ?? 0),
        deleted: deleted.count,
        skipped,
      },
    },
  });

  return ok({ deleted: deleted.count, skipped });
});
