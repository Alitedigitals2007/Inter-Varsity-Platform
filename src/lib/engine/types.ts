// ── Command & event types for the match engine ─────────────────────
// The engine is the single writer of match state. Every mutation is a
// Command; every mutation produces Events appended to match_events.

export type Actor =
  | { kind: "STAFF"; userId: string; loginId: string; name: string; role: "ADMIN" | "GAME_MASTER" }
  | { kind: "SCHOOL"; participantId: string; schoolId: string; displayName: string };

export type CommandType =
  | "MATCH_START"
  | "MATCH_PAUSE"
  | "MATCH_RESUME"
  | "MATCH_END"
  | "TURN_SKIP"
  | "TURN_REPEAT"
  | "QUESTION_SELECT"
  | "QUESTION_REVEAL"
  | "ANSWER_SUBMIT"
  | "ANSWER_JUDGE"
  | "RESULT_REVEAL"
  | "NEXT_TURN"
  | "TIMER_SET"
  | "LEADERBOARD_SET"
  | "BREAK_SET"
  | "SCORE_OVERRIDE"
  | "QUESTION_VOID";

export type Command =
  | { type: "MATCH_START" }
  | { type: "MATCH_PAUSE"; reason?: string }
  | { type: "MATCH_RESUME" }
  | { type: "MATCH_END"; reason?: string }
  | { type: "TURN_SKIP"; reason?: string }
  | { type: "TURN_REPEAT"; reason?: string }
  | {
      type: "QUESTION_SELECT";
      matchQuestionId?: string;
      category?: string;
      pointValue?: number;
    }
  | { type: "QUESTION_REVEAL" }
  | { type: "ANSWER_SUBMIT"; text: string }
  | {
      type: "ANSWER_JUDGE";
      answerId?: string;
      verdict: "CORRECT" | "INCORRECT";
      note?: string;
    }
  | { type: "RESULT_REVEAL" }
  | { type: "NEXT_TURN" }
  | {
      type: "TIMER_SET";
      action: "START" | "PAUSE" | "RESUME" | "ADD" | "REDUCE" | "SET" | "STOP";
      ms?: number;
      reason?: string;
    }
  | { type: "LEADERBOARD_SET"; visible: boolean }
  | { type: "BREAK_SET"; visible: boolean }
  | { type: "SCORE_OVERRIDE"; schoolId: string; points: number; reason: string }
  | { type: "QUESTION_VOID"; matchQuestionId: string; reason: string };

/** Events distributed to clients. Every payload carries matchId, version and phase. */
export type EventType =
  | "MATCH_READY"
  | "MATCH_STARTED"
  | "MATCH_PAUSED"
  | "MATCH_RESUMED"
  | "MATCH_COMPLETED"
  | "TURN_STARTED"
  | "TURN_SKIPPED"
  | "TURN_REPEATED"
  | "QUESTION_SELECTION_OPENED"
  | "QUESTION_SELECTED"
  | "QUESTION_REVEALED"
  | "QUESTION_VOIDED"
  | "TIMER_UPDATED"
  | "TIMER_EXPIRED"
  | "ANSWER_SUBMITTED"
  | "ANSWER_JUDGED"
  | "RESULT_REVEALED"
  | "SCORE_UPDATED"
  | "LEADERBOARD_VISIBILITY_CHANGED"
  | "BREAK_CHANGED"
  | "ROUND_COMPLETED"
  | "CONNECTION_STATUS_CHANGED";

export type EngineEvent = {
  seq: number;
  type: EventType;
  payload: Record<string, unknown>;
};

export type EngineErrorInfo = { code: string; message: string };
