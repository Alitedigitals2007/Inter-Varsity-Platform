import { handle, ok, rateLimit, clientKey, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword, createStaffSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  loginId: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const POST = handle(async (req) => {
  rateLimit(clientKey(req, "login"), 10, 60_000);
  const { loginId, password } = schema.parse(await req.json());

  const user = await prisma.user.findUnique({
    where: { loginId: loginId.trim().toLowerCase() },
  });
  if (!user || !user.active) {
    throw new ApiError(401, "Invalid login ID or password", "INVALID_CREDENTIALS");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "Invalid login ID or password", "INVALID_CREDENTIALS");
  }

  await createStaffSession(user.id);
  return ok({
    id: user.id,
    loginId: user.loginId,
    name: user.name,
    role: user.role,
  });
});
