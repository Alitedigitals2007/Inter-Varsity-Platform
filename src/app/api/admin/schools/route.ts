import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const GET = handle(async () => {
  await requireAdmin();
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { accessCodes: true, participants: true } } },
  });
  return ok({ schools });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  abbreviation: z.string().min(1).max(12).optional(),
  location: z.string().max(200).optional(),
  contactInfo: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());
  const school = await prisma.school.create({
    data: {
      name: input.name.trim(),
      abbreviation: input.abbreviation?.trim().toUpperCase() || null,
      location: input.location?.trim() || null,
      contactInfo: input.contactInfo?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "SCHOOL_CREATE",
      entityType: "School",
      entityId: school.id,
      after: { name: school.name },
    },
  });
  return ok({ school });
});
