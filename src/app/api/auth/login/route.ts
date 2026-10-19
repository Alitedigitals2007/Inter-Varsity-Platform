import { handle, ok, rateLimit, clientKey, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword, createStaffSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  loginId: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

// Compares against this when the account does not exist so response timing
// never reveals whether a login ID is real.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("__nonexistent_account_placeholder__");
  return dummyHash;
}

export const POST = handle(async (req) => {
  rateLimit(clientKey(req, "login"), 10, 60_000);
  const { loginId, password } = schema.parse(await req.json());
  const cleanLoginId = loginId.trim().toLowerCase();
  rateLimit(`login-id:${cleanLoginId}`, 10, 60_000);

  const user = await prisma.user.findUnique({
    where: { loginId: cleanLoginId },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !valid) {
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
