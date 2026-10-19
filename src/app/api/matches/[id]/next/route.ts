import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Next match in the same competition (round order, then match number) — powers the GM end-of-round panel. */
export const GET = handle<Ctx>(async (_req, ctx) => {
  await requireStaff();
  const { id } = await ctx.params;

  const match = await prisma.match.findUnique({
    where: { id },
    select: {
      id: true,
      competitionId: true,
      matchNumber: true,
      round: { select: { orderIndex: true } },
    },
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");

  const next = await prisma.match.findFirst({
    where: {
      competitionId: match.competitionId,
      id: { not: match.id },
      OR: [
        { round: { orderIndex: { gt: match.round.orderIndex } } },
        {
          round: { orderIndex: match.round.orderIndex },
          matchNumber: { gt: match.matchNumber },
        },
      ],
    },
    orderBy: [{ round: { orderIndex: "asc" } }, { matchNumber: "asc" }],
    select: {
      id: true,
      matchNumber: true,
      status: true,
      round: { select: { name: true } },
      schools: {
        orderBy: { turnOrder: "asc" },
        select: { school: { select: { name: true, abbreviation: true } } },
      },
    },
  });

  return ok({
    next: next
      ? {
          id: next.id,
          matchNumber: next.matchNumber,
          status: next.status,
          roundName: next.round.name,
          schools: next.schools.map((s) => s.school.abbreviation ?? s.school.name),
        }
      : null,
  });
});
