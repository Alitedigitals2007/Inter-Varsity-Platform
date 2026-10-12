import { handle, ok, rateLimit, clientKey, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getIdentity, createSchoolSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(4).max(64),
  displayName: z.string().min(1).max(60).optional(),
  matchId: z.string().min(1).optional(),
});

export const POST = handle(async (req) => {
  rateLimit(clientKey(req, "join"), 12, 60_000);
  const input = schema.parse(await req.json());
  const code = input.code.trim().toUpperCase();

  const access = await prisma.schoolAccessCode.findUnique({
    where: { code },
    include: { school: true, competition: true },
  });
  if (!access) throw new ApiError(403, "Invalid access code", "INVALID_CODE");
  if (access.status !== "ACTIVE") {
    throw new ApiError(403, "This access code has been revoked", "CODE_REVOKED");
  }
  if (access.expiresAt && access.expiresAt.getTime() < Date.now()) {
    throw new ApiError(403, "This access code has expired", "CODE_EXPIRED");
  }

  // Resolve match
  let matchId = access.matchId ?? input.matchId ?? null;
  if (!matchId) {
    const candidates = await prisma.match.findMany({
      where: { competitionId: access.competitionId, status: { in: ["READY", "LIVE", "PAUSED"] } },
      include: { round: true },
      orderBy: { matchNumber: "asc" },
    });
    if (candidates.length === 0) {
      throw new ApiError(404, "No active match found for this competition", "NO_MATCH");
    }
    if (candidates.length > 1) {
      return ok({
        needsMatchSelection: true,
        schoolId: access.schoolId,
        schoolName: access.school.name,
        matches: candidates.map((m) => ({
          id: m.id,
          matchNumber: m.matchNumber,
          roundName: m.round.name,
          status: m.status,
        })),
      });
    }
    matchId = candidates[0].id;
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { competition: true },
  });
  if (!match || match.competitionId !== access.competitionId) {
    throw new ApiError(404, "Match not found for this access code", "NO_MATCH");
  }

  // Rejoin with existing session → no duplicate participant
  const identity = await getIdentity();
  if (identity?.kind === "SCHOOL" && identity.schoolId === access.schoolId) {
    await prisma.matchParticipant.upsert({
      where: {
        matchId_participantId: { matchId: match.id, participantId: identity.participantId },
      },
      create: { matchId: match.id, participantId: identity.participantId },
      update: {},
    });
    await prisma.participant.update({
      where: { id: identity.participantId },
      data: { lastSeenAt: new Date() },
    });
    await prisma.schoolAccessCode.update({
      where: { id: access.id },
      data: { lastUsedAt: new Date() },
    });
    return ok({
      rejoined: true,
      participantId: identity.participantId,
      schoolId: access.schoolId,
      schoolName: access.school.name,
      matchId: match.id,
      displayName: identity.displayName,
    });
  }

  // Enforce device limit (default: one official device per school per match)
  const existing = await prisma.participant.count({
    where: {
      schoolId: access.schoolId,
      matchParticipants: { some: { matchId: match.id } },
    },
  });
  if (existing >= access.maxDevices) {
    throw new ApiError(
      409,
      `This school already has ${existing} device(s) connected. Ask an official to allow another device.`,
      "DEVICE_LIMIT"
    );
  }

  const displayName =
    input.displayName?.trim() || access.school.abbreviation || access.school.name;

  const participant = await prisma.participant.create({
    data: { schoolId: access.schoolId, displayName },
  });
  await prisma.matchParticipant.create({
    data: { matchId: match.id, participantId: participant.id },
  });
  await prisma.schoolAccessCode.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  });
  await createSchoolSession(participant.id);

  return ok({
    rejoined: false,
    participantId: participant.id,
    schoolId: access.schoolId,
    schoolName: access.school.name,
    matchId: match.id,
    displayName,
  });
});
