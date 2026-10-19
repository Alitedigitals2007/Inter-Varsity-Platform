import { handle, ok } from "@/lib/api";
import { getIdentity } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSnapshot, type SnapshotRole } from "@/lib/engine/snapshot";
import { ApiError } from "@/lib/errors";
import { enforceMatchDeadlines } from "@/lib/timers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;

  // server-authoritative timers & auto-advance: any read enforces due transitions
  await enforceMatchDeadlines(id);

  const identity = await getIdentity();
  const identitySchoolId = identity?.kind === "SCHOOL" ? identity.schoolId : null;
  const identityParticipantId =
    identity?.kind === "SCHOOL" ? identity.participantId : null;

  // Membership + public-viewing in one query: a school account only sees the
  // full SCHOOL view for matches it plays in; strangers are PUBLIC consumers
  // and only for competitions opened to the public.
  const meta = await prisma.match.findUnique({
    where: { id },
    select: {
      id: true,
      competition: { select: { publicViewing: true } },
      schools: {
        where: { schoolId: identitySchoolId ?? "" },
        select: { id: true },
        take: 1,
      },
      matchParticipants: {
        where: { participantId: identityParticipantId ?? "" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!meta) throw new ApiError(404, "Match not found", "NOT_FOUND");

  let role: SnapshotRole = "PUBLIC";
  let viewerSchoolId: string | undefined;
  if (identity?.kind === "STAFF") {
    role = "STAFF";
  } else if (
    identity?.kind === "SCHOOL" &&
    (meta.schools.length > 0 || meta.matchParticipants.length > 0)
  ) {
    role = "SCHOOL";
    viewerSchoolId = identity.schoolId;
  }

  if (role === "PUBLIC" && !meta.competition.publicViewing) {
    throw new ApiError(404, "Match not found", "NOT_FOUND");
  }

  const snapshot = await buildSnapshot(id, role, viewerSchoolId);
  if (!snapshot) throw new ApiError(404, "Match not found", "NOT_FOUND");
  return ok(snapshot);
});
