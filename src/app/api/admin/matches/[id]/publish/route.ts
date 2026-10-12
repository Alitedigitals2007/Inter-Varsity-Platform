import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { parseMatchConfig } from "@/lib/engine/config";

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

  const config = parseMatchConfig(match.config);
  const problems: string[] = [];

  if (match.schools.length === 0) problems.push("No schools are assigned.");
  if (match.questions.filter((q) => q.state === "AVAILABLE" || q.state === "SELECTED").length === 0) {
    problems.push("No available questions are assigned.");
  }
  const categories = new Set(match.questions.map((q) => q.question.categoryId));
  if (categories.size === 0) problems.push("No question categories are represented.");

  const totalTurns = config.turns.total;
  if (totalTurns !== null) {
    const usable = match.questions.filter(
      (q) => q.state === "AVAILABLE" || q.state === "SELECTED"
    ).length;
    if (usable < totalTurns) {
      problems.push(
        `Only ${usable} usable question(s) for ${totalTurns} configured turn(s).`
      );
    }
  }

  if (problems.length > 0) {
    return ok({ published: false, problems });
  }

  const updated = await prisma.match.update({
    where: { id },
    data: { status: "READY" },
  });
  await prisma.matchEvent.create({
    data: {
      matchId: id,
      seq: (await prisma.match.findUniqueOrThrow({ where: { id }, select: { eventCounter: true } })).eventCounter + 1,
      type: "MATCH_READY",
      payload: { publishedBy: admin.loginId },
    },
  });
  await prisma.match.update({
    where: { id },
    data: { eventCounter: { increment: 1 }, version: { increment: 1 } },
  });
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
