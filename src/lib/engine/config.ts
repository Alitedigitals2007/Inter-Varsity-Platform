// Match configuration: everything the Admin can tune before a match.
// Stored as JSON on Match.config; parsed with safe defaults.

export type SelectionMethodCfg = "BOARD" | "CATEGORY_VALUE" | "CATEGORY_RANDOM" | "GM_ASSIGNED";
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
    repeatAllowed: boolean;
    skipAllowed: boolean;
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
  turns: { total: null, repeatAllowed: false, skipAllowed: true },
  judging: {
    caseSensitive: false,
    trimWhitespace: true,
    partialMatch: false,
    requireManualReveal: true,
  },
};

function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base === "object" && base !== null && !Array.isArray(base)) {
    if (typeof patch !== "object" || Array.isArray(patch)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
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

/** Parse stored JSON config with defaults, tolerating missing/invalid fields. */
export function parseMatchConfig(raw: unknown): MatchConfig {
  return merge(DEFAULT_MATCH_CONFIG, raw);
}
