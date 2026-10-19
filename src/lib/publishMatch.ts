import { prisma } from "@/lib/db";
import { parseMatchConfig, totalTurnLimit } from "@/lib/engine/config";

// Shared publish checklist — used by the publish route and by the guided
// setup / advance flows so a match is only published when it is playable.

type PublishableMatch = {
  schools: unknown[];
  questions: { state: string; question: { categoryId: string; category: { name: string } } }[];
  config: unknown;
};

export function publishProblems(match: PublishableMatch): string[] {
  const problems: string[] = [];
  const config = parseMatchConfig(match.config);
  if (match.schools.length === 0) problems.push("No schools are assigned.");
  const usableQuestions = match.questions.filter(
    (q) => q.state === "AVAILABLE" || q.state === "SELECTED"
  );
  const usable = usableQuestions.length;
  if (usable === 0) problems.push("No available questions are assigned.");
  if (new Set(match.questions.map((q) => q.question.categoryId)).size === 0) {
    problems.push("No question categories are represented.");
  }
  const totalTurns = totalTurnLimit(config, match.schools.length);
  if (totalTurns !== null && usable < totalTurns) {
    problems.push(`Only ${usable} usable question(s) for ${totalTurns} configured turn(s).`);
  }
  // Per-category quotas from the setup wizard: each school must have enough
  // questions in every category it is scheduled to answer from.
  if (config.questionPlan.length > 0 && match.schools.length > 0) {
    const perCategory = new Map<string, number>();
    for (const q of usableQuestions) {
      perCategory.set(q.question.categoryId, (perCategory.get(q.question.categoryId) ?? 0) + 1);
    }
    for (const row of config.questionPlan) {
      const required = row.perSchool * match.schools.length;
      const have = perCategory.get(row.categoryId) ?? 0;
      if (have < required) {
        const sample = match.questions.find((q) => q.question.categoryId === row.categoryId);
        const name = sample?.question.category.name ?? "a category";
        problems.push(
          `${name}: ${row.perSchool} per school × ${match.schools.length} school(s) needs ${required} question(s) — only ${have} usable assigned.`
        );
      }
    }
  }
  return problems;
}

/** Validates the match and, if it passes, marks it READY + emits MATCH_READY. */
export async function publishMatchIfReady(
  matchId: string,
  actor: string,
  via: string
): Promise<{ ok: boolean; problems: string[] }> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      schools: true,
      questions: { include: { question: { include: { category: true } } } },
    },
  });
  if (!match) return { ok: false, problems: ["Match not found"] };
  if (match.status === "LIVE" || match.status === "COMPLETED") {
    // publishing something already under way must never demote its status
    return { ok: true, problems: [] };
  }
  const problems = publishProblems(match);
  if (problems.length > 0) return { ok: false, problems };

  // Reserve the sequence number atomically (increment-then-read) so two
  // concurrent publishes can never write the same seq.
  await prisma.$transaction(async (tx) => {
    const bumped = await tx.match.update({
      where: { id: matchId },
      data: { eventCounter: { increment: 1 }, version: { increment: 1 }, status: "READY" },
      select: { eventCounter: true },
    });
    await tx.matchEvent.create({
      data: {
        matchId,
        seq: bumped.eventCounter,
        type: "MATCH_READY",
        payload: { publishedBy: actor, via },
      },
    });
  });
  return { ok: true, problems: [] };
}
