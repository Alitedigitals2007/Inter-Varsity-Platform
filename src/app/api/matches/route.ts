import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Match list for staff dashboards (Admin + Game Master). */
export const GET = handle(async () => {
  await requireStaff();
  const matches = await prisma.match.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      competition: { select: { name: true, edition: true } },
      round: { select: { name: true } },
      schools: {
        include: { school: { select: { name: true, abbreviation: true } } },
        orderBy: { turnOrder: "asc" },
      },
      _count: { select: { questions: true } },
    },
    take: 100,
  });
  return ok({ matches });
});
