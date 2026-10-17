import { prisma } from "@/lib/db";
import { parseMatchConfig } from "@/lib/engine/config";

// Shared publish checklist — used by the publish route and by the guided
// setup / advance flows so a match is only published when it is playable.

type PublishableMatch = {
  schools: unknown[];
  questions: { state: string; question: { categoryId: string } }[];
  config: unknown;
};

export function publishProblems(match: PublishableMatch): string[] {
  const problems: string[] = [];
  if (match.schools.length === 0) problems.push("No schools are assigned.");
  const usable = match.questions.filter(
    (q) => q.state === "AVAILABLE" || q.state === "SELECTED"
  ).length;
  if (usable === 0) problems.push("No available questions are assigned.");
  if (new Set(match.questions.map((q) => q.question.categoryId)).size === 0) {
    problems.push("No question categories are represented.");
  }
  const totalTurns = parseMatchConfig(match.config).turns.total;
  if (totalTurns !== null && usable < totalTurns) {
    problems.push(`Only ${usable} usable question(s) for ${totalTurns} configured turn(s).`);
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
  const problems = publishProblems(match);
  if (problems.length > 0) return { ok: false, problems };

  await prisma.$transaction([
    prisma.match.update({ where: { id: matchId }, data: { status: "READY" } }),
    prisma.matchEvent.create({
      data: {
        matchId,
        seq: match.eventCounter + 1,
        type: "MATCH_READY",
        payload: { publishedBy: actor, via },
      },
    }),
    prisma.match.update({
      where: { id: matchId },
      data: { eventCounter: { increment: 1 }, version: { increment: 1 } },
    }),
  ]);
  return { ok: true, problems: [] };
}
