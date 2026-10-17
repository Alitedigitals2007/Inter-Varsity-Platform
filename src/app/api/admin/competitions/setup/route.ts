import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { parseMatchConfig } from "@/lib/engine/config";
import { planStructure, type FormatKey } from "@/lib/formats";
import { publishMatchIfReady } from "@/lib/publishMatch";
import { z } from "zod";

// Guided competition setup: one request creates the competition, the
// rounds/matches the chosen format determines, assigns questions to every
// match and (optionally) publishes them. This is the "one wizard" path —
// the admin never hand-builds the skeleton.

const setupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  edition: z.string().trim().max(100).nullable().optional(),
  venue: z.string().trim().max(200).nullable().optional(),
  organizer: z.string().trim().max(200).nullable().optional(),
  format: z.enum(["LEAGUE_ROUNDS", "KNOCKOUT", "TOP_N_FINAL", "POINTS_RACE"]),
  rules: z.string().max(8000).nullable().optional(),
  roundsCount: z.number().int().min(1).max(20).optional(),
  schoolIds: z.array(z.string().min(1)).min(2).max(32),
  selectionMethod: z.enum(["BOARD", "CATEGORY_VALUE", "CATEGORY_RANDOM", "GM_ASSIGNED"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  questionIds: z.array(z.string().min(1)).max(100).optional(),
  /** Optional override applied to every assigned question. */
  pointValue: z.number().int().min(0).max(1000).optional(),
  publish: z.boolean().optional(),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = setupSchema.parse(await req.json());

  if (new Set(input.schoolIds).size !== input.schoolIds.length) {
    throw new ApiError(400, "A school is listed twice", "VALIDATION");
  }
  const schools = await prisma.school.findMany({
    where: { id: { in: input.schoolIds }, active: true },
    select: { id: true },
  });
  if (schools.length !== input.schoolIds.length) {
    throw new ApiError(400, "One or more schools are unknown or inactive", "VALIDATION");
  }

  const config = parseMatchConfig(input.config ?? {});
  const plan = planStructure(input.format as FormatKey, input.schoolIds, {
    roundsCount: input.roundsCount,
  });
  if (plan.rounds.length === 0) {
    throw new ApiError(400, "The format produced no rounds — check the school list", "VALIDATION");
  }

  let orderedQuestions: { id: string; defaultPoints: number; defaultTimeLimitSec: number | null; bonusPoints: number | null }[] = [];
  if (input.questionIds?.length) {
    const found = await prisma.question.findMany({
      where: { id: { in: input.questionIds }, active: true },
      select: { id: true, defaultPoints: true, defaultTimeLimitSec: true, bonusPoints: true },
    });
    if (found.length !== new Set(input.questionIds).size) {
      throw new ApiError(400, "One or more questions are unknown or inactive", "VALIDATION");
    }
    const byId = new Map(found.map((q) => [q.id, q]));
    orderedQuestions = input.questionIds.map((id) => byId.get(id)!);
  }

  const created = await prisma.$transaction(async (tx) => {
    const competition = await tx.competition.create({
      data: {
        name: input.name,
        edition: input.edition || null,
        venue: input.venue || null,
        organizer: input.organizer || null,
        rules: input.rules?.trim() ? input.rules : null,
        format: input.format,
      },
    });

    const matchIds: string[] = [];
    for (let r = 0; r < plan.rounds.length; r++) {
      const plannedRound = plan.rounds[r];
      const round = await tx.round.create({
        data: {
          competitionId: competition.id,
          name: plannedRound.name,
          orderIndex: r,
          config: config as unknown as object,
        },
      });
      for (let mi = 0; mi < plannedRound.matches.length; mi++) {
        const plannedMatch = plannedRound.matches[mi];
        const match = await tx.match.create({
          data: {
            competitionId: competition.id,
            roundId: round.id,
            matchNumber: mi + 1,
            selectionMethod: input.selectionMethod ?? config.selection.method,
            config: (input.config ?? {}) as object,
            schools: {
              create: plannedMatch.schoolIds.map((schoolId, i) => ({ schoolId, turnOrder: i })),
            },
          },
        });
        matchIds.push(match.id);
        if (orderedQuestions.length > 0) {
          await tx.matchQuestion.createMany({
            data: orderedQuestions.map((q) => ({
              matchId: match.id,
              questionId: q.id,
              pointValue: input.pointValue ?? q.defaultPoints,
              timeLimitSec: q.defaultTimeLimitSec,
              bonusPoints: q.bonusPoints,
            })),
          });
        }
      }
    }
    return { competition, matchIds };
  });

  // Publish each match that passes the shared publish checklist.
  let publishedCount = 0;
  const unpublished: { matchId: string; problems: string[] }[] = [];
  if (input.publish) {
    for (const matchId of created.matchIds) {
      const result = await publishMatchIfReady(matchId, admin.loginId, "competition_setup");
      if (result.ok) publishedCount += 1;
      else unpublished.push({ matchId, problems: result.problems });
    }
    if (publishedCount === created.matchIds.length) {
      await prisma.competition.update({
        where: { id: created.competition.id },
        data: { status: "READY" },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "COMPETITION_SETUP",
      entityType: "Competition",
      entityId: created.competition.id,
      after: {
        format: input.format,
        rounds: plan.rounds.length,
        matches: created.matchIds.length,
        published: publishedCount,
        schools: input.schoolIds.length,
        questions: orderedQuestions.length,
      },
    },
  });

  return ok({
    competitionId: created.competition.id,
    rounds: plan.rounds.length,
    matches: created.matchIds.length,
    published: publishedCount,
    unpublished,
    plan,
  });
});
