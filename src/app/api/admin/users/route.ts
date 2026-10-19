import { handle, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword, revokeUserSessions } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { z } from "zod";

export const GET = handle(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: { id: true, loginId: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return ok({ users });
});

const createSchema = z.object({
  loginId: z.string().min(3).max(100),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "GAME_MASTER"]),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin();
  const input = createSchema.parse(await req.json());
  const loginId = input.loginId.trim().toLowerCase();

  const clash = await prisma.user.findUnique({ where: { loginId } });
  if (clash) {
    throw new ApiError(409, "Login ID already in use", "CONFLICT");
  }

  const user = await prisma.user.create({
    data: {
      loginId,
      passwordHash: await hashPassword(input.password),
      name: input.name.trim(),
      role: input.role,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "USER_CREATE",
      entityType: "User",
      entityId: user.id,
      after: { loginId: user.loginId, role: user.role },
    },
  });
  return ok({ user: { id: user.id, loginId: user.loginId, name: user.name, role: user.role } });
});

const patchSchema = z.object({
  id: z.string().min(1),
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "GAME_MASTER"]).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const PATCH = handle(async (req) => {
  const admin = await requireAdmin();
  const input = patchSchema.parse(await req.json());

  const before = await prisma.user.findUnique({ where: { id: input.id } });
  if (!before) throw new ApiError(404, "User not found", "NOT_FOUND");

  // Never lock the platform out of its last admin.
  const wouldLoseAdmin =
    before.role === "ADMIN" &&
    before.active &&
    (input.active === false || (input.role !== undefined && input.role !== "ADMIN"));
  if (wouldLoseAdmin) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (admins <= 1) {
      throw new ApiError(
        409,
        "The last active admin cannot be deactivated or demoted",
        "CONFLICT"
      );
    }
  }
  if (input.id === admin.userId && input.active === false) {
    throw new ApiError(409, "You cannot deactivate your own account", "CONFLICT");
  }

  const user = await prisma.user.update({
    where: { id: input.id },
    data: {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });
  // Deactivated accounts and changed passwords must not keep live sessions.
  if (input.active === false || input.password !== undefined) {
    await revokeUserSessions(input.id);
  }
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      actorLabel: admin.loginId,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: user.id,
      before: { active: before.active, role: before.role },
      after: { active: user.active, role: user.role, passwordChanged: input.password !== undefined },
    },
  });
  return ok({ user: { id: user.id, loginId: user.loginId, name: user.name, role: user.role, active: user.active } });
});
