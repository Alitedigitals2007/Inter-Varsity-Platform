import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handle(async () => {
  await requireAdmin();
  const [
    competitions,
    liveMatches,
    schools,
    questions,
    categories,
    participants,
    recentAudit,
  ] = await Promise.all([
    prisma.competition.count(),
    prisma.match.findMany({
      where: { status: { in: ["LIVE", "PAUSED", "READY"] } },
      include: {
        competition: { select: { name: true } },
        round: { select: { name: true } },
        schools: { select: { schoolId: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.school.count({ where: { active: true } }),
    prisma.question.count({ where: { active: true } }),
    prisma.category.count(),
    prisma.participant.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: { select: { loginId: true } } },
    }),
  ]);
  return ok({
    competitions,
    liveMatches,
    schools,
    questions,
    categories,
    participants,
    recentAudit,
  });
});
