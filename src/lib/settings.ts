import { prisma } from "./db";

// Platform-wide defaults, editable in Admin → Settings and pre-filled into
// every new match. Stored as a single JSON row (Setting key = "app") so new
// fields can be added without migrations; missing fields fall back here.

export type AppSettings = {
  /** Turns each school plays per match (default prefilled into new matches). */
  defaultTurnsPerSchool: number;
  /** Platform default: top N schools qualify (null = no rule). */
  defaultQualifyCount: number | null;
  /** Platform default: bottom N eliminated (null/0 = no rule). */
  defaultEliminateCount: number | null;
  /** Auto-advance to the next turn after a result is shown. */
  autoAdvance: boolean;
  autoAdvanceSec: number;
  /** Allow countdown / verdict sounds on devices by default. */
  sound: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultTurnsPerSchool: 3,
  defaultQualifyCount: 4,
  defaultEliminateCount: 0,
  autoAdvance: true,
  autoAdvanceSec: 5,
  sound: true,
};

const KEY = "app";

function coerce(raw: unknown): AppSettings {
  const out = { ...DEFAULT_APP_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.defaultTurnsPerSchool === "number") out.defaultTurnsPerSchool = obj.defaultTurnsPerSchool;
  if (obj.defaultQualifyCount === null || typeof obj.defaultQualifyCount === "number") {
    out.defaultQualifyCount = obj.defaultQualifyCount as number | null;
  }
  if (obj.defaultEliminateCount === null || typeof obj.defaultEliminateCount === "number") {
    out.defaultEliminateCount = obj.defaultEliminateCount as number | null;
  }
  if (typeof obj.autoAdvance === "boolean") out.autoAdvance = obj.autoAdvance;
  if (typeof obj.autoAdvanceSec === "number") {
    out.autoAdvanceSec = Math.min(60, Math.max(1, Math.round(obj.autoAdvanceSec)));
  }
  if (typeof obj.sound === "boolean") out.sound = obj.sound;
  return out;
}

/** Current platform settings (defaults merged in). */
export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  return coerce(row?.value ?? null);
}

/** Merge a partial update into the stored settings and return the result. */
export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next = coerce({ ...current, ...patch });
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.parse(JSON.stringify(next)) },
    update: { value: JSON.parse(JSON.stringify(next)) },
  });
  return next;
}
