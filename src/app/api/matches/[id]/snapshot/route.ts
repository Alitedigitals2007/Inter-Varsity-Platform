import { handle, ok } from "@/lib/api";
import { getIdentity } from "@/lib/auth";
import { buildSnapshot, type SnapshotRole } from "@/lib/engine/snapshot";
import { ApiError } from "@/lib/errors";
import { enforceMatchDeadlines } from "@/lib/timers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;

  // server-authoritative timers & auto-advance: any read enforces due transitions
  await enforceMatchDeadlines(id);

  const identity = await getIdentity();

  const role: SnapshotRole =
    identity?.kind === "STAFF" ? "STAFF" : identity?.kind === "SCHOOL" ? "SCHOOL" : "PUBLIC";
  const viewerSchoolId = identity?.kind === "SCHOOL" ? identity.schoolId : undefined;

  const snapshot = await buildSnapshot(id, role, viewerSchoolId);
  if (!snapshot) throw new ApiError(404, "Match not found", "NOT_FOUND");
  return ok(snapshot);
});
