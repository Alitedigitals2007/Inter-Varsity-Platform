import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { publishMatchIfReady, publishProblems } from "@/lib/publishMatch";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Validates a match against the publish checklist and, if valid, marks it
 * READY. Publishing is blocked while required configuration is missing
 * (acceptance criterion: "System blocks publishing if required configuration
 * is missing").
 */
export const POST = handle<Ctx>(async (_req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      schools: true,
      questions: { include: { question: { include: { category: true } } } },
    },
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  if (match.status === "LIVE" || match.status === "COMPLETED") {
    throw new ApiError(409, "Match already in progress", "INVALID_PHASE");
  }

  const problems = publishProblems(match);
  if (problems.length > 0) {
    return ok({ published: false, problems });
  }

  const result = await publishMatchIfReady(id, admin.loginId, "publish_route");
  if (!result.ok) {
    return ok({ published: false, problems: result.problems });
  }
  const updated = await prisma.match.findUniqueOrThrow({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "MATCH_PUBLISH",
      entityType: "Match",
      entityId: id,
      after: { status: "READY" },
      matchId: id,
    },
  });
  return ok({ published: true, problems: [], match: updated });
});
