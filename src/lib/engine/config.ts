// Match configuration: everything the Admin can tune before a match.
// Stored as JSON on Match.config; parsed with safe defaults and sanitized
// against out-of-range/invalid values before it is ever consumed.

import { z } from "zod";

export type SelectionMethodCfg = "BOARD" | "CATEGORY_VALUE" | "CATEGORY_RANDOM" | "GM_ASSIGNED";

/**
 * Per-category question plan chosen in the setup wizard. `boardTotal` is how
 * many questions from the category are drawn into each match (the board the
 * schools pick from); `perSchool` is how many questions each school answers
 * from that category. perSchool × schools must fit inside boardTotal.
 */
export type QuestionPlanRow = {
  categoryId: string;
  boardTotal: number;
  perSchool: number;
};
export type WrongAnswerPolicy = "END_TURN" | "OFFER_STEAL" | "GM_DECIDES";
export type TimeoutAction = "AWAIT_NO_ANSWER" | "AUTO_INCORRECT" | "STAY_OPEN";

export type MatchConfig = {
  selection: {
    method: SelectionMethodCfg;
  };
  timers: {
    selectionSec: number | null;
    answerSec: number;
    bonusSec: number;
    autoStartAnswerTimer: boolean;
  };
  scoring: {
    defaultPoints: number;
    wrongPenalty: number;
    speedBonus: { enabled: boolean; windowSec: number; points: number };
  };
  attempts: {
    max: number;
  };
  wrongAnswer: WrongAnswerPolicy;
  timeoutAction: TimeoutAction;
  answerDisplay: {
    showSubmittedAnswer: boolean;
    showCorrectAnswerAfterReveal: boolean;
    showExplanation: boolean;
    showSchoolName: boolean;
  };
  leaderboard: {
    showRank: boolean;
    showCorrectCount: boolean;
    topN: number | null;
  };
  turns: {
    /** null = play until questions run out or GM ends the match */
    total: number | null;
    /**
     * How many turns each school plays. When set, the match ends after every
     * school has played this many turns (perSchool × number of schools).
     * Takes precedence over `total`.
     */
    perSchool: number | null;
    repeatAllowed: boolean;
    skipAllowed: boolean;
  };
  /** Per-category question quotas (empty = questions were picked by hand). */
  questionPlan: QuestionPlanRow[];
  /** Order of categories for the competition. Categories appear in this order on the board. */
  categoryOrder: string[];
  /** Index into categoryOrder for the currently active category (0 = first category). */
  activeCategoryIndex: number;
  /** Qualification & elimination — applied automatically when the match ends. */
  qualification: {
    /** Top N schools qualify (null = no qualification rule). */
    qualifyCount: number | null;
    /** Bottom N schools are eliminated (null = no elimination rule). */
    eliminateCount: number | null;
  };
  /** Live flow: automatic turn advancement + sound. */
  flow: {
    /** After a result is shown, automatically hand the turn to the next school. */
    autoAdvance: boolean;
    /** Seconds the result stays on screen before the automatic advance. */
    autoAdvanceSec: number;
    /** Allow countdown ticks / verdict chimes on devices (clients may still mute). */
    sound: boolean;
  };
  judging: {
    caseSensitive: boolean;
    trimWhitespace: boolean;
    partialMatch: boolean;
    requireManualReveal: boolean;
  };
};

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  selection: { method: "BOARD" },
  timers: {
    selectionSec: null,
    answerSec: 30,
    bonusSec: 20,
    autoStartAnswerTimer: true,
  },
  scoring: {
    defaultPoints: 10,
    wrongPenalty: 0,
    speedBonus: { enabled: false, windowSec: 5, points: 10 },
  },
  attempts: { max: 1 },
  wrongAnswer: "END_TURN",
  timeoutAction: "AWAIT_NO_ANSWER",
  answerDisplay: {
    showSubmittedAnswer: true,
    showCorrectAnswerAfterReveal: true,
    showExplanation: true,
    showSchoolName: true,
  },
  leaderboard: { showRank: true, showCorrectCount: true, topN: null },
  turns: { total: null, perSchool: null, repeatAllowed: false, skipAllowed: true },
  questionPlan: [],
  categoryOrder: [],
  activeCategoryIndex: 0,
  qualification: { qualifyCount: null, eliminateCount: null },
  flow: { autoAdvance: true, autoAdvanceSec: 5, sound: true },
  judging: {
    caseSensitive: false,
    trimWhitespace: true,
    partialMatch: false,
    requireManualReveal: false,
  },
};

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base === "object" && base !== null && !Array.isArray(base)) {
    if (typeof patch !== "object" || Array.isArray(patch)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(k)) continue;
      if (k in out && typeof out[k] === "object" && out[k] !== null && !Array.isArray(out[k])) {
        out[k] = merge(out[k], v);
      } else {
        out[k] = v;
      }
    }
    return out as T;
  }
  return patch as T;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampIntOrNull(
  v: unknown,
  min: number,
  max: number,
  fallback: number | null
): number | null {
  if (v === null) return null;
  if (v === undefined) return fallback;
  return clampInt(v, min, max, fallback ?? min);
}

const ONE_OF = <T extends string>(values: readonly T[], v: unknown, fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;

function cleanPlan(raw: unknown): QuestionPlanRow[] {
  if (!Array.isArray(raw)) return [];
  const out: QuestionPlanRow[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.categoryId !== "string" || !r.categoryId) continue;
    out.push({
      categoryId: r.categoryId,
      boardTotal: clampInt(r.boardTotal, 1, 500, 1),
      perSchool: clampInt(r.perSchool, 0, 100, 0),
    });
  }
  return out;
}

/** Coerce every field of a merged config into its documented range. */
function sanitize(cfg: MatchConfig): MatchConfig {
  cfg.selection = {
    method: ONE_OF(
      ["BOARD", "CATEGORY_VALUE", "CATEGORY_RANDOM", "GM_ASSIGNED"] as const,
      cfg.selection?.method,
      "BOARD"
    ),
  };
  cfg.timers = {
    selectionSec: clampIntOrNull(cfg.timers?.selectionSec, 5, 600, null),
    answerSec: clampInt(cfg.timers?.answerSec, 5, 600, 30),
    bonusSec: clampInt(cfg.timers?.bonusSec, 1, 600, 20),
    autoStartAnswerTimer: cfg.timers?.autoStartAnswerTimer !== false,
  };
  cfg.scoring = {
    defaultPoints: clampInt(cfg.scoring?.defaultPoints, 0, 1000, 10),
    wrongPenalty: clampInt(cfg.scoring?.wrongPenalty, 0, 1000, 0),
    speedBonus: {
      enabled: cfg.scoring?.speedBonus?.enabled === true,
      windowSec: clampInt(cfg.scoring?.speedBonus?.windowSec, 1, 120, 5),
      points: clampInt(cfg.scoring?.speedBonus?.points, 0, 1000, 10),
    },
  };
  cfg.attempts = { max: clampInt(cfg.attempts?.max, 1, 10, 1) };
  cfg.wrongAnswer = ONE_OF(["END_TURN", "OFFER_STEAL", "GM_DECIDES"] as const, cfg.wrongAnswer, "END_TURN");
  cfg.timeoutAction = ONE_OF(
    ["AWAIT_NO_ANSWER", "AUTO_INCORRECT", "STAY_OPEN"] as const,
    cfg.timeoutAction,
    "AWAIT_NO_ANSWER"
  );
  const ad = cfg.answerDisplay ?? DEFAULT_MATCH_CONFIG.answerDisplay;
  cfg.answerDisplay = {
    showSubmittedAnswer: ad.showSubmittedAnswer !== false,
    showCorrectAnswerAfterReveal: ad.showCorrectAnswerAfterReveal !== false,
    showExplanation: ad.showExplanation !== false,
    showSchoolName: ad.showSchoolName !== false,
  };
  cfg.leaderboard = {
    showRank: cfg.leaderboard?.showRank !== false,
    showCorrectCount: cfg.leaderboard?.showCorrectCount !== false,
    topN: clampIntOrNull(cfg.leaderboard?.topN, 1, 64, null),
  };
  cfg.turns = {
    total: clampIntOrNull(cfg.turns?.total, 0, 200, null),
    perSchool: clampIntOrNull(cfg.turns?.perSchool, 0, 100, null),
    repeatAllowed: cfg.turns?.repeatAllowed === true,
    skipAllowed: cfg.turns?.skipAllowed !== false,
  };
  cfg.questionPlan = cleanPlan(cfg.questionPlan);
  cfg.qualification = {
    qualifyCount: clampIntOrNull(cfg.qualification?.qualifyCount, 0, 64, null),
    eliminateCount: clampIntOrNull(cfg.qualification?.eliminateCount, 0, 64, null),
  };
  cfg.flow = {
    autoAdvance: cfg.flow?.autoAdvance !== false,
    autoAdvanceSec: clampInt(cfg.flow?.autoAdvanceSec, 1, 120, 5),
    sound: cfg.flow?.sound !== false,
  };
  cfg.judging = {
    caseSensitive: cfg.judging?.caseSensitive === true,
    trimWhitespace: cfg.judging?.trimWhitespace !== false,
    partialMatch: cfg.judging?.partialMatch === true,
    requireManualReveal: cfg.judging?.requireManualReveal === true,
  };
  return cfg;
}

/** Parse stored JSON config with defaults, tolerating missing/invalid fields. */
export function parseMatchConfig(raw: unknown): MatchConfig {
  return sanitize(merge(DEFAULT_MATCH_CONFIG, raw));
}

/**
 * Deep-merge a write-time patch over an existing stored config and sanitize
 * the result — keeps untouched fields intact when patching nested sections.
 */
export function mergeMatchConfigPatch(stored: unknown, patch: unknown): MatchConfig {
  const base = parseMatchConfig(stored);
  return sanitize(merge(base, patch));
}

/**
 * Write-time schema for match config patches. Unknown keys are stripped and
 * every value is range-checked so broken configs never reach the database.
 */
export const matchConfigPatchSchema = z.object({
  selection: z
    .object({
      method: z.enum(["BOARD", "CATEGORY_VALUE", "CATEGORY_RANDOM", "GM_ASSIGNED"]),
    })
    .partial()
    .optional(),
  timers: z
    .object({
      selectionSec: z.number().int().min(5).max(600).nullable(),
      answerSec: z.number().int().min(5).max(600),
      bonusSec: z.number().int().min(1).max(600),
      autoStartAnswerTimer: z.boolean(),
    })
    .partial()
    .optional(),
  scoring: z
    .object({
      defaultPoints: z.number().int().min(0).max(1000),
      wrongPenalty: z.number().int().min(0).max(1000),
      speedBonus: z
        .object({
          enabled: z.boolean(),
          windowSec: z.number().int().min(1).max(120),
          points: z.number().int().min(0).max(1000),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),
  attempts: z.object({ max: z.number().int().min(1).max(10) }).partial().optional(),
  wrongAnswer: z.enum(["END_TURN", "OFFER_STEAL", "GM_DECIDES"]).optional(),
  timeoutAction: z.enum(["AWAIT_NO_ANSWER", "AUTO_INCORRECT", "STAY_OPEN"]).optional(),
  answerDisplay: z
    .object({
      showSubmittedAnswer: z.boolean(),
      showCorrectAnswerAfterReveal: z.boolean(),
      showExplanation: z.boolean(),
      showSchoolName: z.boolean(),
    })
    .partial()
    .optional(),
  leaderboard: z
    .object({
      showRank: z.boolean(),
      showCorrectCount: z.boolean(),
      topN: z.number().int().min(1).max(64).nullable(),
    })
    .partial()
    .optional(),
  turns: z
    .object({
      total: z.number().int().min(0).max(200).nullable(),
      perSchool: z.number().int().min(0).max(100).nullable(),
      repeatAllowed: z.boolean(),
      skipAllowed: z.boolean(),
    })
    .partial()
    .optional(),
  questionPlan: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        boardTotal: z.number().int().min(1).max(500),
        perSchool: z.number().int().min(0).max(100),
      })
    )
    .max(40)
    .optional(),
  categoryOrder: z.array(z.string().min(1)).max(40).optional(),
  activeCategoryIndex: z.number().int().min(0).max(100).optional(),
  qualification: z
    .object({
      qualifyCount: z.number().int().min(0).max(64).nullable(),
      eliminateCount: z.number().int().min(0).max(64).nullable(),
    })
    .partial()
    .optional(),
  flow: z
    .object({
      autoAdvance: z.boolean(),
      autoAdvanceSec: z.number().int().min(1).max(120),
      sound: z.boolean(),
    })
    .partial()
    .optional(),
  judging: z
    .object({
      caseSensitive: z.boolean(),
      trimWhitespace: z.boolean(),
      partialMatch: z.boolean(),
      requireManualReveal: z.boolean(),
    })
    .partial()
    .optional(),
});

/** Total number of turns the match will play, or null when open-ended. */
export function totalTurnLimit(config: MatchConfig, schoolCount: number): number | null {
  if (config.turns.perSchool !== null) {
    return config.turns.perSchool * Math.max(1, schoolCount);
  }
  return config.turns.total;
}
