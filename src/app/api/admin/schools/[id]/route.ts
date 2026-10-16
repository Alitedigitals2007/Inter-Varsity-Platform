import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  abbreviation: z.string().min(1).max(12).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  contactInfo: z.string().max(300).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
  // uploading a device logo stores it as Media and mirrors the public URL
  logoMediaId: z.string().max(40).nullable().optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = patchSchema.parse(await req.json());

  const before = await prisma.school.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "School not found", "NOT_FOUND");

  const school = await prisma.school.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.abbreviation !== undefined
        ? { abbreviation: input.abbreviation?.trim().toUpperCase() || null }
        : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.contactInfo !== undefined ? { contactInfo: input.contactInfo } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.logoMediaId !== undefined
        ? input.logoMediaId
          ? { logoMediaId: input.logoMediaId, logoUrl: `/api/media/${input.logoMediaId}` }
          : { logoMediaId: null, logoUrl: null }
        : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "SCHOOL_UPDATE",
      entityType: "School",
      entityId: id,
      before: { name: before.name, active: before.active },
      after: { name: school.name, active: school.active },
    },
  });
  return ok({ school });
});
