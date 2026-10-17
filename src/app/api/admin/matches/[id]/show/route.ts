import { handle, ok, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

// ── Show Director: per-match segment timeline (admin / GM) ──────────

const segmentSchema = z.object({
  type: z.enum([
    "BACKDROP",
    "EVENT_BRANDING",
    "TEAM_CARDS",
    "SPONSOR_ROTATION",
    "SPONSOR_SPOTLIGHT",
    "PARTNER_SLIDE",
    "FINAL_ACK",
    "COUNTDOWN",
    "TICKER",
    "BORDER_FX",
  ]),
  placement: z.enum(["PRE_GAME", "BREAK", "IN_GAME"]),
  durationSec: z.number().int().min(2).max(300).default(8),
  enabled: z.boolean().default(true),
  slot: z
    .enum(["corner-bug", "lower-third", "transition", "backdrop", "banner"])
    .nullable()
    .default(null),
  mediaId: z.string().max(40).nullable().default(null),
  sponsorId: z.string().max(40).nullable().default(null),
  style: z.record(z.string(), z.unknown()).nullable().default(null),
});

const putSchema = z.object({ segments: z.array(segmentSchema).max(40) });

async function loadMatch(id: string) {
  const match = await prisma.match.findUnique({
    where: { id },
    select: {
      id: true,
      matchNumber: true,
      competition: { select: { id: true, name: true, logoUrl: true } },
      round: { select: { name: true } },
    },
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  return match;
}

export const GET = handle<Ctx>(async (_req, ctx) => {
  await requireStaff();
  const { id } = await ctx.params;
  const match = await loadMatch(id);

  const [segments, sponsors, schools] = await Promise.all([
    prisma.showSegment.findMany({
      where: { matchId: id },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        type: true,
        placement: true,
        durationSec: true,
        enabled: true,
        slot: true,
        mediaId: true,
        sponsorId: true,
        style: true,
      },
    }),
    prisma.sponsor.findMany({
      where: { active: true },
      orderBy: { brandName: "asc" },
      select: {
        id: true,
        brandName: true,
        logoUrl: true,
        website: true,
        description: true,
        brandColors: true,
        tier: true,
        active: true,
      },
    }),
    prisma.matchSchool.findMany({
      where: { matchId: id },
      orderBy: { turnOrder: "asc" },
      select: {
        turnOrder: true,
        school: {
          select: { id: true, name: true, abbreviation: true, logoUrl: true },
        },
      },
    }),
  ]);

  return ok({
    match,
    segments,
    sponsors,
    schools: schools.map((ms) => ({ turnOrder: ms.turnOrder, ...ms.school })),
  });
});

export const PUT = handle<Ctx>(async (req, ctx) => {
  const staff = await requireStaff();
  const { id } = await ctx.params;
  await loadMatch(id);
  const { segments } = putSchema.parse(await req.json());

  await prisma.$transaction(async (tx) => {
    await tx.showSegment.deleteMany({ where: { matchId: id } });
    let order = 0;
    for (const seg of segments) {
      await tx.showSegment.create({
        data: {
          matchId: id,
          orderIndex: order++,
          type: seg.type,
          placement: seg.placement,
          durationSec: seg.durationSec,
          enabled: seg.enabled,
          slot: seg.slot,
          mediaId: seg.mediaId,
          sponsorId: seg.sponsorId,
          ...(seg.style
            ? { style: JSON.parse(JSON.stringify(seg.style)) as Prisma.InputJsonValue }
            : {}),
        },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: staff.userId,
      actorLabel: staff.loginId,
      action: "SHOW_UPDATE",
      entityType: "Match",
      entityId: id,
      after: { segments: segments.length },
    },
  });

  return ok({ saved: segments.length });
});
