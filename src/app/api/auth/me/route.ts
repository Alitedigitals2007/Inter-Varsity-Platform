import { handle, ok } from "@/lib/api";
import { getIdentity } from "@/lib/auth";

export const GET = handle(async () => {
  const identity = await getIdentity();
  return ok({ identity });
});
