import { handle, ok, requireAdmin } from "@/lib/api";
import { getAppSettings, updateAppSettings } from "@/lib/settings";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  return ok({ settings: await getAppSettings() });
});

const putSchema = z.object({
  defaultTurnsPerSchool: z.number().int().min(1).max(50).optional(),
  defaultQualifyCount: z.number().int().min(0).max(64).nullable().optional(),
  defaultEliminateCount: z.number().int().min(0).max(64).nullable().optional(),
  autoAdvance: z.boolean().optional(),
  autoAdvanceSec: z.number().int().min(1).max(60).optional(),
  sound: z.boolean().optional(),
});

export const PUT = handle(async (req) => {
  await requireAdmin();
  const patch = putSchema.parse(await req.json());
  const settings = await updateAppSettings(patch);
  return ok({ settings });
});
