import { handle, ok } from "@/lib/api";
import { getIdentity } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ablyEnabled, ablyRequestToken } from "@/lib/ably";
import { matchChannel, namedChannel } from "@/lib/bus";

export const dynamic = "force-dynamic";

/**
 * Exchanges the caller's session for a scoped Ably token.
 *  - STAFF:  subscribe to every match channel + staff channels
 *  - SCHOOL: subscribe only to matches their school is part of
 *  - PUBLIC: subscribe only to the requested match (screens/audience)
 *
 * Returns { configured: false } when ABLY_API_KEY is absent — the client
 * hook then uses snapshot polling (offline / LAN / polling-only mode).
 */
export const GET = handle(async (req) => {
  if (!ablyEnabled()) {
    return ok({ configured: false });
  }

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");

  const identity = await getIdentity();
  let capability: Record<string, string[]> = {};
  let clientId: string | undefined;

  if (identity?.kind === "STAFF") {
    clientId = `staff-${identity.userId}`;
    capability = {
      [matchChannel("*")]: ["subscribe"],
      [namedChannel("*")]: ["subscribe"],
    };
  } else if (identity?.kind === "SCHOOL") {
    clientId = `school-${identity.participantId}`;
    const [participations, schoolMatches] = await Promise.all([
      prisma.matchParticipant.findMany({
        where: { participantId: identity.participantId },
        select: { matchId: true },
        take: 100,
      }),
      prisma.matchSchool.findMany({
        where: { schoolId: identity.schoolId },
        select: { matchId: true },
        take: 100,
      }),
    ]);
    const ids = new Set([
      ...participations.map((p) => p.matchId),
      ...schoolMatches.map((m) => m.matchId),
    ]);
    // A school never gets a channel for a match it is not part of — the
    // join flow creates the participant row before subscribing.
    if (matchId && ids.has(matchId)) capability[matchChannel(matchId)] = ["subscribe"];
    for (const id of ids) capability[matchChannel(id)] = ["subscribe"];
  } else if (matchId) {
    clientId = "public";
    // anonymous audiences may only follow competitions opened to the public
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, competition: { select: { publicViewing: true } } },
    });
    if (match?.competition.publicViewing) {
      capability[matchChannel(matchId)] = ["subscribe"];
    }
  }

  try {
    const { token, expiresAt } = await ablyRequestToken(capability, clientId);
    return ok({ configured: true, token, expiresAt });
  } catch (err) {
    console.error("[realtime] token mint failed", err);
    // fall back to polling rather than breaking the screen
    return ok({ configured: false });
  }
});
