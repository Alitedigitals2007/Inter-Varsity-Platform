import { handle, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Public match list for the venue screen picker (no auth required). */
export const GET = handle(async () => {
  const matches = await prisma.match.findMany({
    where: { status: { in: ["READY", "LIVE", "PAUSED", "COMPLETED"] } },
    include: {
      competition: { select: { name: true, publicViewing: true } },
      round: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return ok({
    matches: matches
      .filter((m) => m.competition.publicViewing)
      .map((m) => ({
        id: m.id,
        matchNumber: m.matchNumber,
        status: m.status,
        competition: { name: m.competition.name },
        round: { name: m.round.name },
      })),
  });
});
