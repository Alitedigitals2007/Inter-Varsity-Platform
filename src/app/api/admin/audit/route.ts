import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId") ?? undefined;
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const take = Math.min(Number(url.searchParams.get("take") ?? 100), 500);
  const skip = Number(url.searchParams.get("skip") ?? 0);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(matchId ? { matchId } : {}),
        ...(entityType ? { entityType } : {}),
      },
      include: { user: { select: { loginId: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.auditLog.count({ where: matchId ? { matchId } : undefined }),
  ]);
  return ok({ logs, total });
});
