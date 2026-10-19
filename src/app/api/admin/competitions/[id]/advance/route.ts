import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { publishMatchIfReady } from "@/lib/publishMatch";

type Ctx = { params: Promise<{ id: string }> };

// "The rules determine the next": once every match of the latest round has
// completed, this builds the next round from the QUALIFIED schools.
//   KNOCKOUT      → winners are paired again (three-way if odd)
//   TOP_N_FINAL   → one Final match with every qualified school
// Match config and selection method carry over from the previous round.

export const POST = handle<Ctx>(async (_req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) throw new ApiError(404, "Competition not found", "NOT_FOUND");
  if (competition.format !== "KNOCKOUT" && competition.format !== "TOP_N_FINAL") {
    throw new ApiError(
      409,
      "Automatic round creation applies to the Knockout and Qualify & finals formats",
      "INVALID_PHASE"
    );
  }

  const rounds = await prisma.round.findMany({
    where: { competitionId: id },
    orderBy: { orderIndex: "asc" },
    include: {
      matches: {
        orderBy: { matchNumber: "asc" },
        include: { schools: { orderBy: { turnOrder: "asc" } } },
      },
    },
  });
  const isFinalRound = (r: (typeof rounds)[number]) =>
    ((r.config as Record<string, unknown> | null) ?? {}).finalRound === true ||
    r.name === "Final";

  const last = rounds[rounds.length - 1];
  if (!last) throw new ApiError(409, "Create the first round before advancing", "INVALID_PHASE");
  if (isFinalRound(last)) {
    throw new ApiError(409, "The Final is already set — the competition is at its last round", "INVALID_PHASE");
  }
  if (last.matches.length === 0 || last.matches.some((m) => m.status !== "COMPLETED")) {
    throw new ApiError(409, "Finish every match in the current round first", "INVALID_PHASE");
  }

  const qualified: string[] = [];
  for (const m of last.matches) {
    for (const s of m.schools) {
      if (s.qualification === "QUALIFIED") qualified.push(s.schoolId);
    }
  }
  if (qualified.length < 2) {
    throw new ApiError(
      409,
      "No qualified schools yet — qualification is applied automatically when each match ends (or mark winners QUALIFIED on the scoreboard)",
      "INVALID_PHASE"
    );
  }

  let name: string;
  let groups: string[][];
  if (competition.format === "TOP_N_FINAL") {
    if (rounds.some(isFinalRound)) {
      throw new ApiError(409, "The Final already exists", "INVALID_PHASE");
    }
    name = "Final";
    groups = [qualified];
  } else {
    groups = [];
    for (let i = 0; i < qualified.length; i += 2) groups.push(qualified.slice(i, i + 2));
    if (qualified.length % 2 === 1) {
      const lastGroup = groups.pop()!;
      const prev = groups.pop()!;
      groups.push([...prev, ...lastGroup]);
    }
    name = groups.length === 1 ? "Final" : `Round ${last.orderIndex + 2}`;
  }

  const template = last.matches[0];
  // Voided questions stay behind, and questions deactivated in the bank can
  // no longer be played — only live questions carry into the next round.
  const templateQuestions = await prisma.matchQuestion.findMany({
    where: {
      matchId: template.id,
      state: { not: "VOIDED" },
      question: { active: true },
    },
    select: { questionId: true, pointValue: true, timeLimitSec: true, bonusPoints: true },
  });

  // The Final is marked in the round config (name matching is fragile).
  const roundConfig: Record<string, unknown> = {
    ...((template.config ?? {}) as Record<string, unknown>),
  };
  delete roundConfig.finalRound;
  if (name === "Final") roundConfig.finalRound = true;

  const { newRound, matchIds } = await prisma.$transaction(async (tx) => {
    const round = await tx.round.create({
      data: {
        competitionId: id,
        name,
        orderIndex: last.orderIndex + 1,
        config: roundConfig as object,
      },
    });
    const ids: string[] = [];
    for (let mi = 0; mi < groups.length; mi++) {
      const match = await tx.match.create({
        data: {
          competitionId: id,
          roundId: round.id,
          matchNumber: mi + 1,
          selectionMethod: template.selectionMethod,
          config: (template.config ?? {}) as object,
          schools: {
            create: groups[mi].map((schoolId, i) => ({ schoolId, turnOrder: i })),
          },
        },
      });
      ids.push(match.id);
      if (templateQuestions.length > 0) {
        await tx.matchQuestion.createMany({
          data: templateQuestions.map((q) => ({
            matchId: match.id,
            questionId: q.questionId,
            pointValue: q.pointValue,
            timeLimitSec: q.timeLimitSec,
            bonusPoints: q.bonusPoints,
          })),
        });
      }
    }
    // A freshly added round means there is more to play — un-complete the
    // competition if the previous round had auto-completed it.
    if (competition.status === "COMPLETED") {
      await tx.competition.update({ where: { id }, data: { status: "READY" } });
    }
    return { newRound: round, matchIds: ids };
  });

  // The new round inherits the question set and is published when playable.
  let publishedCount = 0;
  const unpublished: { matchId: string; problems: string[] }[] = [];
  for (const matchId of matchIds) {
    const result = await publishMatchIfReady(matchId, admin.loginId, "competition_advance");
    if (result.ok) publishedCount += 1;
    else unpublished.push({ matchId, problems: result.problems });
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "COMPETITION_ADVANCE",
      entityType: "Round",
      entityId: newRound.id,
      after: { name, matches: groups.length, qualified: qualified.length, published: publishedCount },
      reason: "auto_advance_from_qualified",
    },
  });

  return ok({
    round: { id: newRound.id, name: newRound.name, orderIndex: newRound.orderIndex },
    matches: groups.length,
    qualified: qualified.length,
    published: publishedCount,
    unpublished,
  });
});
