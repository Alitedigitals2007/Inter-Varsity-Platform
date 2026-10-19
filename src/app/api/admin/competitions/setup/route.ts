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
  /** Old path: questions picked by hand (used when questionPlan is absent). */
  questionIds: z.array(z.string().min(1)).max(100).optional(),
  /**
   * Per-category plan: for each category, how many questions go on the board
   * of every match and how many each school answers. Turns per school are
   * derived from it (sum of perSchool).
   */
  questionPlan: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        boardTotal: z.number().int().min(1).max(500),
        perSchool: z.number().int().min(1).max(100),
      })
    )
    .max(40)
    .optional(),
  /** Optional override applied to every assigned question. */
  pointValue: z.number().int().min(0).max(1000).optional(),
  publish: z.boolean().optional(),
});

type QuestionRow = {
  id: string;
  defaultPoints: number;
  defaultTimeLimitSec: number | null;
  bonusPoints: number | null;
};

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

  let config = parseMatchConfig(input.config ?? {});
  const plan = planStructure(input.format as FormatKey, input.schoolIds, {
    roundsCount: input.roundsCount,
  });
  if (plan.rounds.length === 0) {
    throw new ApiError(400, "The format produced no rounds — check the school list", "VALIDATION");
  }

  // ── Per-category plan: validate against the bank, build per-match boards ──
  const planRows = (input.questionPlan ?? []).filter((r) => r.perSchool > 0 || r.boardTotal > 0);
  const planPools = new Map<string, QuestionRow[]>();
  if (input.questionPlan && planRows.length === 0) {
    throw new ApiError(400, "Set at least one category (questions per school) in the setup", "VALIDATION");
  }
  if (planRows.length > 0) {    if (input.questionIds?.length) {
      throw new ApiError(400, "Use either questionPlan or questionIds, not both", "VALIDATION");
    }
    if (new Set(planRows.map((r) => r.categoryId)).size !== planRows.length) {
      throw new ApiError(400, "A category is listed twice", "VALIDATION");
    }
    const schoolsPerMatch = Math.max(
      ...plan.rounds.flatMap((r) => r.matches.map((m) => m.schoolIds.length))
    );
    const categories = await prisma.category.findMany({
      where: { id: { in: planRows.map((r) => r.categoryId) } },
      select: { id: true, name: true },
    });
    if (categories.length !== planRows.length) {
      throw new ApiError(400, "One or more categories are unknown", "VALIDATION");
    }
    const nameOf = new Map(categories.map((c) => [c.id, c.name]));
    const pool = await prisma.question.findMany({
      where: { active: true, categoryId: { in: planRows.map((r) => r.categoryId) } },
      select: { id: true, categoryId: true, defaultPoints: true, defaultTimeLimitSec: true, bonusPoints: true },
    });
    for (const row of planRows) {
      const name = nameOf.get(row.categoryId)!;
      const needed = row.perSchool * schoolsPerMatch;
      if (row.boardTotal < needed) {
        throw new ApiError(
          400,
          `${name}: ${schoolsPerMatch} school(s) × ${row.perSchool} per school needs ${needed} on the board, but the board is set to ${row.boardTotal}`,
          "VALIDATION"
        );
      }
      const inBank = pool.filter((q) => q.categoryId === row.categoryId);
      if (inBank.length < row.boardTotal) {
        throw new ApiError(
          400,
          `${name}: the board asks for ${row.boardTotal} question(s) but only ${inBank.length} active question(s) are in the bank`,
          "VALIDATION"
        );
      }
      planPools.set(row.categoryId, shuffle(inBank));
    }
    const turnsPerSchool = planRows.reduce((n, r) => n + r.perSchool, 0);
    config = {
      ...config,
      turns: { ...config.turns, perSchool: turnsPerSchool },
      questionPlan: planRows,
    };
  }

  let orderedQuestions: QuestionRow[] = [];
  if (planRows.length === 0 && input.questionIds?.length) {
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
    let matchIndex = 0;
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
            config: config as unknown as object,
            schools: {
              create: plannedMatch.schoolIds.map((schoolId, i) => ({ schoolId, turnOrder: i })),
            },
          },
        });
        matchIds.push(match.id);

        const rows: {
          questionId: string;
          pointValue: number;
          timeLimitSec: number | null;
          bonusPoints: number | null;
        }[] = [];
        if (planRows.length > 0) {
          // Rotate through each category's shuffled bank so matches get
          // different questions whenever the bank is big enough.
          for (const row of planRows) {
            const pool = planPools.get(row.categoryId)!;
            for (let k = 0; k < row.boardTotal; k++) {
              const q = pool[(matchIndex * row.boardTotal + k) % pool.length];
              rows.push({
                questionId: q.id,
                pointValue: input.pointValue ?? q.defaultPoints,
                timeLimitSec: q.defaultTimeLimitSec,
                bonusPoints: q.bonusPoints,
              });
            }
          }
        } else {
          for (const q of orderedQuestions) {
            rows.push({
              questionId: q.id,
              pointValue: input.pointValue ?? q.defaultPoints,
              timeLimitSec: q.defaultTimeLimitSec,
              bonusPoints: q.bonusPoints,
            });
          }
        }
        if (rows.length > 0) {
          await tx.matchQuestion.createMany({
            data: rows.map((row) => ({ matchId: match.id, ...row })),
          });
        }
        matchIndex += 1;
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
        questions:
          planRows.length > 0
            ? planRows.reduce((n, r) => n + r.boardTotal, 0) * created.matchIds.length
            : orderedQuestions.length * created.matchIds.length,
        questionPlan: planRows.length > 0 ? planRows : undefined,
      },
    },
  });

  return ok({
    competitionId: created.competition.id,
    rounds: plan.rounds.length,
    matches: created.matchIds.length,
    published: publishedCount,
    unpublished,
    turnsPerSchool: config.turns.perSchool,
    plan,
  });
});
