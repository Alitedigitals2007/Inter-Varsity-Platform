import { handle, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * Public view of a match's live-show configuration (venue screen).
 * Returns the enabled segments plus everything the stage needs to render:
 * competition branding, participating schools with logos, sponsor media.
 * When the admin has not composed a show, built-in defaults are returned.
 */
export const GET = handle<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;

  const match = await prisma.match.findUnique({
    where: { id },
    select: {
      id: true,
      competition: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          venue: true,
          edition: true,
          startsAt: true,
        },
      },
      round: { select: { name: true } },
      matchNumber: true,
      schools: {
        orderBy: { turnOrder: "asc" },
        select: {
          turnOrder: true,
          school: {
            select: { id: true, name: true, abbreviation: true, logoUrl: true },
          },
        },
      },
      showSegments: {
        where: { enabled: true },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          type: true,
          placement: true,
          durationSec: true,
          slot: true,
          style: true,
          mediaId: true,
          sponsor: { select: { id: true, brandName: true, logoUrl: true } },
        },
      },
    },
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");

  const segments = match.showSegments.map((s) => ({
    id: s.id,
    type: s.type,
    placement: s.placement,
    durationSec: s.durationSec,
    slot: s.slot,
    style: s.style ?? null,
    mediaUrl: s.mediaId ? `/api/media/${s.mediaId}` : null,
    sponsorName: s.sponsor?.brandName ?? null,
    sponsorLogoUrl: s.sponsor?.logoUrl ?? null,
  }));

  const sponsors = await prisma.sponsor.findMany({
    where: { active: true, logoUrl: { not: null } },
    orderBy: { brandName: "asc" },
    select: { brandName: true, logoUrl: true },
  });

  return ok({
    matchId: match.id,
    competition: match.competition,
    round: match.round.name,
    matchNumber: match.matchNumber,
    schools: match.schools.map((ms) => ({
      schoolId: ms.school.id,
      turnOrder: ms.turnOrder,
      name: ms.school.name,
      abbreviation: ms.school.abbreviation,
      logoUrl: ms.school.logoUrl,
    })),
    sponsors,
    segments,
    defaults: segments.length === 0,
  });
});
