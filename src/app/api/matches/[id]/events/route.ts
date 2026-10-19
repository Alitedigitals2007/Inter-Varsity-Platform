import { handle, numericParam, ok } from "@/lib/api";
import { requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Full chronological event history for the Game Master / admin monitor. */
export const GET = handle<Ctx>(async (req, ctx) => {
  await requireStaff();
  const { id } = await ctx.params;
  const take = numericParam(req, "take", 200, 1, 500);

  const match = await prisma.match.findUnique({ where: { id }, select: { id: true } });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");

  const events = await prisma.matchEvent.findMany({
    where: { matchId: id },
    orderBy: { seq: "desc" },
    take,
  });
  return ok({ events });
});
