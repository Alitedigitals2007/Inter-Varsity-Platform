import { prisma } from "../db";
import { parseMatchConfig } from "./config";
import type { MatchPhase, MatchQuestionState, MatchStatus, TimerStatus, QuestionType } from "@prisma/client";

export type SnapshotRole = "PUBLIC" | "SCHOOL" | "STAFF";

export type TimerView = {
  status: TimerStatus;
  phase: string | null;
  deadlineMs: number | null;
  remainingMs: number | null;
  serverTimeMs: number;
};

export function timerView(match: {
  timerStatus: TimerStatus;
  timerPhase: string | null;
  timerDeadline: Date | null;
  timerRemainingMsOnPause: number | null;
}): TimerView {
  const serverTimeMs = Date.now();
  if (match.timerStatus === "RUNNING" && match.timerDeadline) {
    return {
      status: match.timerStatus,
      phase: match.timerPhase,
      deadlineMs: match.timerDeadline.getTime(),
      remainingMs: Math.max(0, match.timerDeadline.getTime() - serverTimeMs),
      serverTimeMs,
    };
  }
  if (match.timerStatus === "EXPIRED") {
    return {
      status: match.timerStatus,
      phase: match.timerPhase,
      deadlineMs: null,
      remainingMs: 0,
      serverTimeMs,
    };
  }
  return {
    status: match.timerStatus,
    phase: match.timerPhase,
    deadlineMs: null,
    remainingMs:
      match.timerStatus === "PAUSED" ? (match.timerRemainingMsOnPause ?? 0) : null,
    serverTimeMs,
  };
}

export type SnapshotSchool = {
  schoolId: string;
  name: string;
  abbreviation: string | null;
  logoUrl: string | null;
  score: number;
  correctCount: number;
  turnOrder: number;
  qualification: string;
  isPlaying: boolean;
};

export type ActiveQuestionView = {
  matchQuestionId: string | null;
  state: MatchQuestionState | null;
  categoryId: string | null;
  categoryName: string | null;
  pointValue: number | null;
  bonusPoints: number | null;
  isBonus: boolean;
  revealed: boolean;
  text: string | null;
  type: QuestionType | null;
  options: { id: string; text: string }[] | null;
  /** Present only after RESULT_REVEAL (authorized reveal moment). */
  answerKey: string | null;
  explanation: string | null;
};

export type BoardCell = {
  matchQuestionId: string;
  categoryId: string;
  categoryName: string;
  pointValue: number;
  state: MatchQuestionState;
};

export type ResultView = {
  matchQuestionId: string;
  schoolId: string | null;
  verdict: string | null;
  pointsAwarded: number;
  answerText: string | null;
  correctAnswer: string | null;
  explanation: string | null;
  revealed: boolean;
} | null;

export type LeaderboardRow = {
  rank: number;
  schoolId: string;
  name: string;
  abbreviation: string | null;
  logoUrl: string | null;
  score: number;
  correctCount: number;
  qualification: string;
};

export type MatchSnapshot = {
  matchId: string;
  competition: { id: string; name: string; logoUrl: string | null; edition: string | null; status: string };
  round: { id: string; name: string; orderIndex: number };
  matchNumber: number;
  status: MatchStatus;
  phase: MatchPhase;
  version: number;
  selectionMethod: string;
  leaderboardVisible: boolean;
  breakActive: boolean;
  serverTimeMs: number;
  schools: SnapshotSchool[];
  turn: {
    counter: number;
    index: number;
    activeSchoolId: string | null;
    order: string[];
    totalTurns: number | null;
  };
  activeQuestion: ActiveQuestionView;
  board: BoardCell[];
  timer: TimerView;
  lastResult: ResultView;
  leaderboard: LeaderboardRow[] | null;
  /**
   * STAFF-only: answers still awaiting manual judgment (subjective questions)
   * or pending correction. Never included for SCHOOL/PUBLIC roles.
   */
  pendingAnswers?: {
    answerId: string;
    schoolId: string;
    schoolName: string;
    text: string;
    submittedAtMs: number;
    attempt: number;
  }[];
  /** For SCHOOL-role snapshots only. */
  viewerSchoolId?: string;
};

const REVEALED_PHASES: MatchPhase[] = ["ANSWERING", "JUDGING", "AWAITING_REVEAL", "RESULT"];

export async function buildSnapshot(
  matchId: string,
  role: SnapshotRole,
  viewerSchoolId?: string
): Promise<MatchSnapshot | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      competition: true,
      round: true,
      schools: {
        include: { school: true },
        orderBy: { turnOrder: "asc" },
      },
      questions: {
        include: {
          question: { include: { category: true, options: { orderBy: { orderIndex: "asc" } } } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!match) return null;

  const config = parseMatchConfig(match.config);
  const revealed = REVEALED_PHASES.includes(match.phase);
  const atResult = match.phase === "RESULT";

  const mq = match.activeMatchQuestionId
    ? match.questions.find((q) => q.id === match.activeMatchQuestionId)
    : undefined;

  const activeQuestion: ActiveQuestionView = mq
    ? {
        matchQuestionId: mq.id,
        state: mq.state,
        categoryId: mq.question.categoryId,
        categoryName: mq.question.category.name,
        pointValue: mq.pointValue,
        bonusPoints: mq.bonusPoints,
        isBonus: mq.question.isBonus,
        revealed,
        text: revealed ? mq.question.text : null,
        type: revealed ? mq.question.type : null,
        options: revealed
          ? mq.question.options.map((o) => ({ id: o.id, text: o.text }))
          : null,
        answerKey:
          atResult && config.answerDisplay.showCorrectAnswerAfterReveal
            ? (mq.question.answerKey ??
              mq.question.options.find((o) => o.isCorrect)?.text ??
              null)
            : null,
        explanation:
          atResult && config.answerDisplay.showExplanation
            ? mq.question.explanation
            : null,
      }
    : {
        matchQuestionId: null,
        state: null,
        categoryId: null,
        categoryName: null,
        pointValue: null,
        bonusPoints: null,
        isBonus: false,
        revealed: false,
        text: null,
        type: null,
        options: null,
        answerKey: null,
        explanation: null,
      };

  const board: BoardCell[] = match.questions.map((q) => ({
    matchQuestionId: q.id,
    categoryId: q.question.categoryId,
    categoryName: q.question.category.name,
    pointValue: q.pointValue,
    state: q.state,
  }));

  const schools: SnapshotSchool[] = match.schools.map((ms) => ({
    schoolId: ms.schoolId,
    name: ms.school.name,
    abbreviation: ms.school.abbreviation,
    logoUrl: ms.school.logoUrl,
    score: ms.score,
    correctCount: ms.correctCount,
    turnOrder: ms.turnOrder,
    qualification: ms.qualification,
    isPlaying: ms.schoolId === match.activeSchoolId,
  }));

  // Last result: most recent answer on the active (or most recent) question.
  const latestAnswer = await prisma.answer.findFirst({
    where: { matchId: match.id },
    orderBy: { submittedAt: "desc" },
  });

  let lastResult: ResultView = null;
  if (latestAnswer) {
    const scored = await prisma.scoreEvent.findFirst({
      where: { answerId: latestAnswer.id },
      orderBy: { createdAt: "desc" },
    });
    lastResult = {
      matchQuestionId: latestAnswer.matchQuestionId,
      schoolId: latestAnswer.schoolId,
      verdict: latestAnswer.verdict,
      pointsAwarded: scored?.points ?? 0,
      answerText: atResult && config.answerDisplay.showSubmittedAnswer ? latestAnswer.text : null,
      correctAnswer:
        atResult && config.answerDisplay.showCorrectAnswerAfterReveal
          ? (match.questions.find((q) => q.id === latestAnswer.matchQuestionId)?.question
              .answerKey ?? null)
          : null,
      explanation:
        atResult && config.answerDisplay.showExplanation
          ? (match.questions.find((q) => q.id === latestAnswer.matchQuestionId)?.question
              .explanation ?? null)
          : null,
      revealed: atResult,
    };
  }

  // Leaderboard: always computed for staff; others only when visible.
  const ranked = [...schools].sort(
    (a, b) =>
      b.score - a.score ||
      b.correctCount - a.correctCount ||
      a.turnOrder - b.turnOrder
  );
  const topN = config.leaderboard.topN;
  const trimmed = topN ? ranked.slice(0, topN) : ranked;
  const leaderboard: LeaderboardRow[] | null =
    role === "STAFF" || match.leaderboardVisible
      ? trimmed.map((s, i) => ({
          rank: i + 1,
          schoolId: s.schoolId,
          name: s.name,
          abbreviation: s.abbreviation,
          logoUrl: s.logoUrl,
          score: s.score,
          correctCount: s.correctCount,
          qualification: s.qualification,
        }))
      : null;

  // Pending answers: STAFF-only view for manual judging / correction.
  let pendingAnswers: MatchSnapshot["pendingAnswers"];
  if (role === "STAFF") {
    const pending = await prisma.answer.findMany({
      where: { matchId: match.id, verdict: "PENDING" },
      include: { school: { select: { name: true } } },
      orderBy: { submittedAt: "asc" },
    });
    if (pending.length > 0) {
      pendingAnswers = pending.map((a) => ({
        answerId: a.id,
        schoolId: a.schoolId,
        schoolName: a.school.name,
        text: a.text,
        submittedAtMs: a.submittedAt.getTime(),
        attempt: a.attempt,
      }));
    }
  }

  return {
    matchId: match.id,
    competition: {
      id: match.competitionId,
      name: match.competition.name,
      logoUrl: match.competition.logoUrl,
      edition: match.competition.edition,
      status: match.competition.status,
    },
    round: {
      id: match.roundId,
      name: match.round.name,
      orderIndex: match.round.orderIndex,
    },
    matchNumber: match.matchNumber,
    status: match.status,
    phase: match.phase,
    version: match.version,
    selectionMethod: match.selectionMethod,
    leaderboardVisible: match.leaderboardVisible,
    breakActive: match.breakActive,
    serverTimeMs: Date.now(),
    schools,
    turn: {
      counter: match.turnCounter,
      index: match.currentTurnIndex,
      activeSchoolId: match.activeSchoolId,
      order: match.schools.map((s) => s.schoolId),
      totalTurns: config.turns.total,
    },
    activeQuestion,
    board,
    timer: timerView(match),
    lastResult,
    leaderboard,
    ...(pendingAnswers ? { pendingAnswers } : {}),
    ...(role === "SCHOOL" && viewerSchoolId ? { viewerSchoolId } : {}),
  };
}
