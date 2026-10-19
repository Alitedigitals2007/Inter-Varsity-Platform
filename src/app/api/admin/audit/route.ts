import { handle, ok, numericParam, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId") ?? undefined;
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const take = numericParam(req, "take", 100, 1, 500);
  const skip = numericParam(req, "skip", 0, 0, 1_000_000);

  const where = {
    ...(matchId ? { matchId } : {}),
    ...(entityType ? { entityType } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { loginId: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return ok({ logs, total });
});
