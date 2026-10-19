import { prisma } from "../db";
import type {
  Prisma,
  Match,
  MatchSchool,
  MatchQuestion,
  Question,
  Category,
  QuestionOption,
  School,
  QualificationStatus,
} from "@prisma/client";
import { parseMatchConfig, totalTurnLimit, type MatchConfig } from "./config";
import { judgeAnswer } from "./judge";
import { buildSnapshot, timerView, type MatchSnapshot } from "./snapshot";
import { ApiError } from "../errors";
import type { Actor, Command, EventType } from "./types";

type Tx = Prisma.TransactionClient;

export type Emitted = { type: EventType; payload: Record<string, unknown> };
export type CommandOutcome = { snapshot: MatchSnapshot; events: Emitted[] };

type MatchRow = Match & {
  schools: (MatchSchool & { school: School })[];
  questions: (MatchQuestion & {
    question: Question & { category: Category; options: QuestionOption[] };
  })[];
};

const MATCH_INCLUDE = {
  schools: { include: { school: true }, orderBy: { turnOrder: "asc" as const } },
  questions: {
    include: {
      question: {
        include: {
          category: true,
          options: { orderBy: { orderIndex: "asc" as const } },
        },
      },
    },
  },
};

// ── small helpers ──────────────────────────────────────────────

function assertStaff(actor: Actor) {
  if (actor.kind !== "STAFF") {
    throw new ApiError(403, "Game Master or Admin access required", "FORBIDDEN");
  }
  return actor;
}

async function lockMatch(tx: Tx, matchId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
  if (rows.length === 0) throw new ApiError(404, "Match not found", "NOT_FOUND");
}

async function loadMatch(tx: Tx, matchId: string): Promise<MatchRow> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: MATCH_INCLUDE,
  });
  if (!match) throw new ApiError(404, "Match not found", "NOT_FOUND");
  return match as MatchRow;
}

async function audit(
  tx: Tx,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    matchId?: string;
  }
) {
  await tx.auditLog.create({
    data: {
      userId: actor.kind === "STAFF" ? actor.userId : null,
      actorLabel:
        actor.kind === "STAFF"
          ? actor.loginId
          : `${actor.displayName} (${actor.schoolId})`,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before as Prisma.InputJsonValue | undefined,
      after: entry.after as Prisma.InputJsonValue | undefined,
      reason: entry.reason,
      matchId: entry.matchId,
    },
  });
}

async function adjustScore(
  tx: Tx,
  matchId: string,
  schoolId: string,
  delta: number,
  correctDelta: number
) {
  await tx.matchSchool.update({
    where: { matchId_schoolId: { matchId, schoolId } },
    data: {
      score: { increment: delta },
      ...(correctDelta ? { correctCount: { increment: correctDelta } } : {}),
    },
  });
}

// ── timer ──────────────────────────────────────────────────────

async function applyTimerAction(
  tx: Tx,
  match: Match,
  action: "START" | "PAUSE" | "RESUME" | "ADD" | "REDUCE" | "SET" | "STOP",
  ms: number | undefined,
  now: Date,
  userId: string | null,
  reason?: string
): Promise<void> {
  let deadline = match.timerDeadline;
  let status = match.timerStatus;
  let remaining = match.timerRemainingMsOnPause;
  let durationSec = match.timerDurationSec;
  const deadlineBefore = match.timerDeadline;
  const prevRemaining =
    status === "RUNNING" && deadline
      ? Math.max(0, deadline.getTime() - now.getTime())
      : (remaining ?? null);

  switch (action) {
    case "START": {
      const durMs = ms !== undefined ? Math.max(0, ms) : (durationSec ?? 30) * 1000;
      deadline = new Date(now.getTime() + durMs);
      durationSec = Math.max(1, Math.round(durMs / 1000));
      status = "RUNNING";
      remaining = null;
      break;
    }
    case "PAUSE": {
      if (status !== "RUNNING" || !deadline) {
        throw new ApiError(409, "Timer is not running", "INVALID_PHASE");
      }
      remaining = Math.max(0, deadline.getTime() - now.getTime());
      deadline = null;
      status = "PAUSED";
      break;
    }
    case "RESUME": {
      if (status !== "PAUSED") {
        throw new ApiError(409, "Timer is not paused", "INVALID_PHASE");
      }
      deadline = new Date(now.getTime() + (remaining ?? 0));
      remaining = null;
      status = "RUNNING";
      break;
    }
    case "ADD":
    case "REDUCE": {
      const delta = (ms ?? 0) * (action === "ADD" ? 1 : -1);
      if (status === "RUNNING" && deadline) {
        deadline = new Date(Math.max(now.getTime(), deadline.getTime() + delta));
      } else if (status === "PAUSED") {
        remaining = Math.max(0, (remaining ?? 0) + delta);
      } else {
        throw new ApiError(409, "Timer is not running", "INVALID_PHASE");
      }
      break;
    }
    case "SET": {
      const value = Math.max(0, ms ?? 0);
      // keep the stored duration in step with the new value — the ring clock
      // renders `remaining / duration` and would otherwise show a wrong arc
      durationSec = Math.max(1, Math.round(value / 1000));
      if (status === "RUNNING") {
        deadline = new Date(now.getTime() + value);
      } else {
        status = "PAUSED";
        remaining = value;
        deadline = null;
      }
      break;
    }
    case "STOP": {
      status = "STOPPED";
      deadline = null;
      remaining = null;
      break;
    }
  }

  const timerPatch =
    action === "START" || action === "RESUME"
      ? { timerStartedAt: now }
      : action === "STOP"
        ? { timerStartedAt: null }
        : {};

  await tx.match.update({
    where: { id: match.id },
    data: {
      timerStatus: status,
      timerDeadline: deadline,
      timerRemainingMsOnPause: remaining,
      timerDurationSec: durationSec,
      timerLastModifiedById: userId,
      timerLastModifiedAt: now,
      ...timerPatch,
    },
  });
  Object.assign(match, {
    timerStatus: status,
    timerDeadline: deadline,
    timerRemainingMsOnPause: remaining,
    timerDurationSec: durationSec,
    timerLastModifiedById: userId,
    timerLastModifiedAt: now,
    ...timerPatch,
  });

  await tx.timerEvent.create({
    data: {
      matchId: match.id,
      action,
      phase: match.phase,
      previousValueMs: prevRemaining,
      newValueMs:
        status === "RUNNING" && deadline
          ? deadline.getTime() - now.getTime()
          : (remaining ?? null),
      deadlineBefore,
      deadlineAfter: deadline,
      reason,
      createdById: userId,
    },
  });
}

function timerEventPayload(match: Match): Record<string, unknown> {
  const view = timerView(match);
  return {
    status: view.status,
    timerPhase: view.phase,
    deadlineMs: view.deadlineMs,
    remainingMs: view.remainingMs,
    serverTimeMs: view.serverTimeMs,
  };
}

async function stopTimerIfRunning(
  tx: Tx,
  match: Match,
  now: Date,
  userId: string | null,
  reason = "phase_change",
  events: Emitted[] = []
) {
  if (match.timerStatus === "RUNNING" || match.timerStatus === "PAUSED") {
    await applyTimerAction(tx, match, "STOP", undefined, now, userId, reason);
    events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
  }
}

// ── turn / match flow ─────────────────────────────────────────

function hasAvailableQuestions(match: MatchRow): boolean {
  return match.questions.some((q) => q.state === "AVAILABLE");
}

async function openTurn(
  tx: Tx,
  match: MatchRow,
  config: MatchConfig,
  turnIndex: number,
  now: Date,
  userId: string | null,
  events: Emitted[]
): Promise<void> {
  const order = match.schools.map((s) => s.schoolId);
  const activeSchoolId = order.length ? order[turnIndex % order.length] : null;
  const data = {
    currentTurnIndex: turnIndex,
    turnCounter: turnIndex + 1,
    activeSchoolId,
    activeMatchQuestionId: null,
    phase: "SELECTION" as const,
    timerPhase: "SELECTION",
  };
  await tx.match.update({ where: { id: match.id }, data });
  Object.assign(match, data);

  events.push({ type: "TURN_STARTED", payload: { turnIndex, schoolId: activeSchoolId } });
  events.push({ type: "QUESTION_SELECTION_OPENED", payload: { turnIndex } });

  if (config.timers.selectionSec && config.selection.method !== "GM_ASSIGNED") {
    await applyTimerAction(
      tx,
      match,
      "START",
      config.timers.selectionSec * 1000,
      now,
      userId,
      "selection_timer"
    );
    events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
  }
}

async function endMatch(
  tx: Tx,
  match: MatchRow,
  config: MatchConfig,
  now: Date,
  userId: string | null,
  events: Emitted[],
  reason?: string
): Promise<void> {
  await stopTimerIfRunning(tx, match, now, userId, "match_end", events);
  const data = {
    status: "COMPLETED" as const,
    phase: "ENDED" as const,
    endedAt: now,
    autoAdvanceAt: null,
  };
  await tx.match.update({ where: { id: match.id }, data });
  Object.assign(match, data);
  events.push({ type: "MATCH_COMPLETED", payload: { reason: reason ?? null } });
  await applyQualification(tx, match, config, events);
  await maybeCompleteRound(tx, match, events);
}

/** Total number of turns the match will play, or null when open-ended. (moved to config.ts) */

function rankSchools(schools: (MatchSchool & { school: School })[]) {
  return [...schools].sort(
    (a, b) =>
      b.score - a.score ||
      b.correctCount - a.correctCount ||
      a.turnOrder - b.turnOrder
  );
}

/**
 * Qualification & elimination (spec §11.3–11.5): when a match ends and the
 * admin configured qualifying/eliminated counts, rank the schools and mark
 * them. A tie that straddles a cut line is flagged PENDING for official
 * review instead of being decided arbitrarily.
 */
async function applyQualification(
  tx: Tx,
  match: MatchRow,
  config: MatchConfig,
  events: Emitted[]
): Promise<void> {
  const { qualifyCount, eliminateCount } = config.qualification;
  if (qualifyCount === null && eliminateCount === null) return;

  const ranked = rankSchools(match.schools);
  const n = ranked.length;
  // qualification and elimination can never overlap on the same row
  const qN = qualifyCount === null ? 0 : Math.max(0, Math.min(qualifyCount, n));
  const eN =
    eliminateCount === null
      ? 0
      : Math.max(0, Math.min(eliminateCount, n - qN));
  const tied = (a: MatchSchool, b: MatchSchool) =>
    a.score === b.score && a.correctCount === b.correctCount;

  const statuses: QualificationStatus[] = ranked.map((_s, i) => {
    if (i < qN) return "QUALIFIED";
    if (i >= n - eN) return "ELIMINATED";
    return "NOT_APPLICABLE";
  });

  // boundary ties → PENDING (spec §11.4: flag, never pick arbitrarily).
  // The WHOLE tied block around the cut line is flagged, not just the pair.
  const flagTiedBlock = (idx: number) => {
    const anchor = ranked[idx];
    let start = idx;
    let end = idx;
    while (start > 0 && tied(ranked[start - 1], anchor)) start -= 1;
    while (end < n - 1 && tied(ranked[end + 1], anchor)) end += 1;
    for (let i = start; i <= end; i++) statuses[i] = "PENDING";
  };
  if (qN > 0 && qN < n && tied(ranked[qN - 1], ranked[qN])) {
    flagTiedBlock(qN - 1);
  }
  const eCut = n - eN;
  if (eN > 0 && eCut > 0 && eCut < n && tied(ranked[eCut - 1], ranked[eCut])) {
    flagTiedBlock(eCut);
  }

  for (let i = 0; i < ranked.length; i++) {
    await tx.matchSchool.update({
      where: { id: ranked[i].id },
      data: { qualification: statuses[i] },
    });
    ranked[i].qualification = statuses[i];
  }

  events.push({
    type: "QUALIFICATION_UPDATED",
    payload: {
      source: "auto",
      rows: ranked.map((ms, i) => ({
        schoolId: ms.schoolId,
        rank: i + 1,
        score: ms.score,
        correctCount: ms.correctCount,
        qualification: statuses[i],
      })),
    },
  });
}

/** Round completes when every match in it is done (spec §4.2 / §11.5). */
async function maybeCompleteRound(
  tx: Tx,
  match: MatchRow,
  events: Emitted[]
): Promise<void> {
  const openInRound = await tx.match.count({
    where: { roundId: match.roundId, status: { notIn: ["COMPLETED", "ARCHIVED"] } },
  });
  if (openInRound > 0) return;

  await tx.round.update({ where: { id: match.roundId }, data: { status: "COMPLETED" } });
  events.push({ type: "ROUND_COMPLETED", payload: { roundId: match.roundId } });

  const openRounds = await tx.round.count({
    where: { competitionId: match.competitionId, status: { not: "COMPLETED" } },
  });
  if (openRounds === 0) {
    await tx.competition.update({
      where: { id: match.competitionId },
      data: { status: "COMPLETED" },
    });
  }
}

async function advanceTurn(
  tx: Tx,
  match: MatchRow,
  config: MatchConfig,
  now: Date,
  userId: string | null,
  events: Emitted[],
  endReason?: string
): Promise<void> {
  const nextIndex = match.currentTurnIndex + 1;
  const limit = totalTurnLimit(config, match.schools.length);
  if (limit !== null && nextIndex >= limit) {
    await endMatch(tx, match, config, now, userId, events, endReason ?? "all_turns_played");
    return;
  }
  if (!hasAvailableQuestions(match)) {
    await endMatch(tx, match, config, now, userId, events, endReason ?? "questions_exhausted");
    return;
  }
  if (match.schools.length === 0) {
    await endMatch(tx, match, config, now, userId, events, endReason ?? "no_schools");
    return;
  }
  await openTurn(tx, match, config, nextIndex, now, userId, events);
}

// ── scoring ────────────────────────────────────────────────────

async function awardScore(
  tx: Tx,
  match: MatchRow,
  config: MatchConfig,
  mq: MatchQuestion,
  answer: { id: string; verdict: string },
  now: Date,
  events: Emitted[],
  bonusPoints = 0
): Promise<number> {
  if (answer.verdict !== "CORRECT") {
    if (config.scoring.wrongPenalty > 0) {
      await tx.scoreEvent.create({
        data: {
          matchId: match.id,
          schoolId: mq.selectedBySchoolId ?? "",
          type: "PENALTY",
          points: -config.scoring.wrongPenalty,
          matchQuestionId: mq.id,
          answerId: answer.id,
          reason: "wrong_answer_penalty",
        },
      });
      return -config.scoring.wrongPenalty;
    }
    return 0;
  }

  let delta = mq.pointValue;
  await tx.scoreEvent.create({
    data: {
      matchId: match.id,
      schoolId: mq.selectedBySchoolId ?? "",
      type: "CORRECT_ANSWER",
      points: mq.pointValue,
      questionId: mq.questionId,
      matchQuestionId: mq.id,
      answerId: answer.id,
    },
  });

  // Bonus questions are worth their extra points on a correct answer.
  if (bonusPoints > 0) {
    delta += bonusPoints;
    await tx.scoreEvent.create({
      data: {
        matchId: match.id,
        schoolId: mq.selectedBySchoolId ?? "",
        type: "BONUS",
        points: bonusPoints,
        questionId: mq.questionId,
        matchQuestionId: mq.id,
        answerId: answer.id,
        reason: "bonus_question",
      },
    });
  }

  const sb = config.scoring.speedBonus;
  if (
    sb.enabled &&
    match.timerStatus === "RUNNING" &&
    match.timerPhase === "ANSWERING" &&
    match.timerStartedAt &&
    now.getTime() - match.timerStartedAt.getTime() <= sb.windowSec * 1000
  ) {
    delta += sb.points;
    await tx.scoreEvent.create({
      data: {
        matchId: match.id,
        schoolId: mq.selectedBySchoolId ?? "",
        type: "SPEED_BONUS",
        points: sb.points,
        matchQuestionId: mq.id,
        answerId: answer.id,
        reason: `answered within ${sb.windowSec}s`,
      },
    });
  }
  return delta;
}

/** Reverses all score events already recorded for an answer (used by void/correction). */
async function reverseScoresForAnswer(
  tx: Tx,
  answerId: string,
  reason: string
): Promise<{ schoolId: string; delta: number }[]> {
  const eventsForAnswer = await tx.scoreEvent.findMany({
    where: { answerId, reversalOfId: null },
  });
  const existingReversals = await tx.scoreEvent.findMany({
    where: { reversalOfId: { in: eventsForAnswer.map((e) => e.id) } },
  });
  const reversedIds = new Set(existingReversals.map((r) => r.reversalOfId));
  const affected: { schoolId: string; delta: number }[] = [];

  for (const ev of eventsForAnswer) {
    if (reversedIds.has(ev.id)) continue;
    const answer = await tx.answer.findUniqueOrThrow({ where: { id: answerId } });
    await tx.scoreEvent.create({
      data: {
        matchId: ev.matchId,
        schoolId: ev.schoolId,
        type: ev.type === "CORRECT_ANSWER" ? "QUESTION_VOID_REVERSAL" : "RESULT_CORRECTION",
        points: -ev.points,
        questionId: ev.questionId,
        matchQuestionId: ev.matchQuestionId,
        answerId,
        reversalOfId: ev.id,
        reason,
      },
    });
    await adjustScore(
      tx,
      ev.matchId,
      ev.schoolId,
      -ev.points,
      ev.type === "CORRECT_ANSWER" ? -1 : 0
    );
    affected.push({ schoolId: ev.schoolId, delta: -ev.points });
    void answer;
  }
  return affected;
}

// ── main entry ────────────────────────────────────────────────

export async function executeCommand(
  matchId: string,
  command: Command,
  actor: Actor
): Promise<CommandOutcome> {
  const events: Emitted[] = [];
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      await lockMatch(tx, matchId);
      const match = await loadMatch(tx, matchId);
      const config = parseMatchConfig(match.config);
      const phaseBefore = match.phase;

      const patchMatch = async (data: Record<string, unknown>) => {
        await tx.match.update({ where: { id: match.id }, data: data as never });
        Object.assign(match, data);
      };

      switch (command.type) {
        // ── match lifecycle ────────────────────────────────────
        case "MATCH_START": {
          assertStaff(actor);
          if (match.status !== "DRAFT" && match.status !== "READY") {
            throw new ApiError(409, "Match already started", "INVALID_PHASE");
          }
          if (match.phase !== "LOBBY") {
            throw new ApiError(409, "Match is not in the lobby", "INVALID_PHASE");
          }
          if (match.schools.length < 1) {
            throw new ApiError(400, "No schools are assigned to this match", "VALIDATION");
          }
          if (!hasAvailableQuestions(match)) {
            throw new ApiError(400, "Match has no available questions", "VALIDATION");
          }
          await patchMatch({ status: "LIVE", startedAt: now });
          // mark the round / competition as live for reports & dashboards
          await tx.round
            .update({ where: { id: match.roundId }, data: { status: "LIVE" } })
            .catch(() => null);
          await tx.competition
            .update({ where: { id: match.competitionId }, data: { status: "LIVE" } })
            .catch(() => null);
          events.push({ type: "MATCH_STARTED", payload: {} });
          // a zero turn limit means the match is over the moment it starts
          const startUserId = actor.kind === "STAFF" ? actor.userId : null;
          if (totalTurnLimit(config, match.schools.length) === 0) {
            await endMatch(tx, match, config, now, startUserId, events, "all_turns_played");
            break;
          }
          await openTurn(tx, match, config, 0, now, startUserId, events);
          break;
        }

        case "MATCH_PAUSE": {
          const staff = assertStaff(actor);
          if (match.status !== "LIVE") {
            throw new ApiError(409, "Match is not live", "INVALID_PHASE");
          }
          await patchMatch({ status: "PAUSED" });
          if (match.timerStatus === "RUNNING") {
            await applyTimerAction(tx, match, "PAUSE", undefined, now, staff.userId, command.reason);
            events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
          }
          await audit(tx, actor, {
            action: "MATCH_PAUSE",
            entityType: "Match",
            entityId: match.id,
            reason: command.reason,
            matchId: match.id,
          });
          events.push({ type: "MATCH_PAUSED", payload: { reason: command.reason ?? null } });
          break;
        }

        case "MATCH_RESUME": {
          const staff = assertStaff(actor);
          if (match.status !== "PAUSED") {
            throw new ApiError(409, "Match is not paused", "INVALID_PHASE");
          }
          await patchMatch({ status: "LIVE" });
          if (match.timerStatus === "PAUSED") {
            await applyTimerAction(tx, match, "RESUME", undefined, now, staff.userId);
            events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
          }
          events.push({ type: "MATCH_RESUMED", payload: {} });
          break;
        }

        case "MATCH_END": {
          const staff = assertStaff(actor);
          if (match.status === "COMPLETED") {
            throw new ApiError(409, "Match already completed", "INVALID_PHASE");
          }
          await audit(tx, actor, {
            action: "MATCH_END",
            entityType: "Match",
            entityId: match.id,
            reason: command.reason,
            matchId: match.id,
          });
          await endMatch(tx, match, config, now, staff.userId, events, command.reason ?? "manual_end");
          break;
        }

        // ── question selection ─────────────────────────────────
        case "QUESTION_SELECT": {
          if (match.status !== "LIVE" || match.phase !== "SELECTION") {
            throw new ApiError(409, "Question selection is not open", "INVALID_PHASE");
          }

          let actorSchoolId: string | null = null;
          if (actor.kind === "STAFF") {
            // staff may always select (GM-assigned flow)
          } else {
            if (config.selection.method === "GM_ASSIGNED") {
              throw new ApiError(403, "Questions are assigned by the Game Master", "FORBIDDEN");
            }
            if (!match.activeSchoolId || match.activeSchoolId !== actor.schoolId) {
              throw new ApiError(403, "It is not your turn to select", "NOT_YOUR_TURN");
            }
            // the selection clock is authoritative — a reconnecting device
            // cannot keep choosing after the deadline passed
            if (
              match.timerPhase === "SELECTION" &&
              (match.timerStatus === "EXPIRED" ||
                (match.timerStatus === "RUNNING" &&
                  match.timerDeadline !== null &&
                  match.timerDeadline.getTime() < now.getTime()))
            ) {
              throw new ApiError(409, "Selection time is up", "TIME_EXPIRED");
            }
            actorSchoolId = actor.schoolId;
          }

          let target = command.matchQuestionId
            ? match.questions.find((q) => q.id === command.matchQuestionId)
            : undefined;

          if (!target && (command.category || command.pointValue !== undefined)) {
            const candidates = match.questions.filter(
              (q) =>
                q.state === "AVAILABLE" &&
                (!command.category || q.question.categoryId === command.category) &&
                (command.pointValue === undefined || q.pointValue === command.pointValue)
            );
            if (candidates.length === 0) {
              throw new ApiError(404, "No available question matches", "NOT_FOUND");
            }
            target =
              config.selection.method === "CATEGORY_RANDOM"
                ? candidates[Math.floor(Math.random() * candidates.length)]
                : candidates[0];
          }

          if (!target) {
            throw new ApiError(400, "Question reference required", "VALIDATION");
          }
          if (target.state !== "AVAILABLE") {
            throw new ApiError(409, "That question is no longer available", "TAKEN");
          }

          const selectedFor = actorSchoolId ?? match.activeSchoolId;
          await tx.matchQuestion.update({
            where: { id: target.id },
            data: {
              state: "SELECTED",
              selectedBySchoolId: selectedFor,
              selectedAt: now,
            },
          });
          Object.assign(target, {
            state: "SELECTED" as const,
            selectedBySchoolId: selectedFor,
            selectedAt: now,
          });
          await patchMatch({ activeMatchQuestionId: target.id });

          await stopTimerIfRunning(tx, match, now, actor.kind === "STAFF" ? actor.userId : null, "question_selected", events);

          events.push({
            type: "QUESTION_SELECTED",
            payload: {
              matchQuestionId: target.id,
              schoolId: selectedFor,
              categoryId: target.question.categoryId,
              pointValue: target.pointValue,
            },
          });

          // Auto-open: the question goes straight on screen — no separate
          // reveal step. When `requireManualReveal` is configured the question
          // stays SELECTED until the GM sends QUESTION_REVEAL. The answer key
          // stays server-side; only the question text/options are public.
          if (config.judging.requireManualReveal && actor.kind !== "STAFF") {
            break;
          }
          await tx.matchQuestion.update({
            where: { id: target.id },
            data: { state: "ACTIVE" },
          });
          Object.assign(target, { state: "ACTIVE" as const });
          await patchMatch({ phase: "ANSWERING", timerPhase: "ANSWERING" });
          events.push({ type: "QUESTION_REVEALED", payload: { matchQuestionId: target.id } });

          const staffId = actor.kind === "STAFF" ? actor.userId : null;
          if (config.timers.autoStartAnswerTimer) {
            const durSec =
              (target.timeLimitSec ?? config.timers.answerSec) +
              (target.question.isBonus ? config.timers.bonusSec : 0);
            await applyTimerAction(tx, match, "START", durSec * 1000, now, staffId, "answer_timer");
            events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
          }
          break;
        }

        case "QUESTION_REVEAL": {
          const staff = assertStaff(actor);
          if (match.status !== "LIVE" || match.phase !== "SELECTION") {
            throw new ApiError(409, "No question is awaiting reveal", "INVALID_PHASE");
          }
          const mq = match.questions.find((q) => q.id === match.activeMatchQuestionId);
          if (!mq || (mq.state !== "SELECTED" && mq.state !== "ACTIVE")) {
            throw new ApiError(409, "Select a question first", "INVALID_PHASE");
          }
          await tx.matchQuestion.update({
            where: { id: mq.id },
            data: { state: "ACTIVE" },
          });
          Object.assign(mq, { state: "ACTIVE" as const });
          await patchMatch({ phase: "ANSWERING", timerPhase: "ANSWERING" });
          events.push({ type: "QUESTION_REVEALED", payload: { matchQuestionId: mq.id } });

          if (config.timers.autoStartAnswerTimer) {
            const durSec =
              (mq.timeLimitSec ?? config.timers.answerSec) +
              (mq.question.isBonus ? config.timers.bonusSec : 0);
            await applyTimerAction(tx, match, "START", durSec * 1000, now, staff.userId, "answer_timer");
            events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
          }
          break;
        }

        // ── answers ────────────────────────────────────────────
        case "ANSWER_SUBMIT": {
          if (match.status !== "LIVE" || match.phase !== "ANSWERING") {
            throw new ApiError(409, "The answer phase is not open", "INVALID_PHASE");
          }
          const mq = match.questions.find((q) => q.id === match.activeMatchQuestionId);
          if (!mq) throw new ApiError(409, "No active question", "INVALID_PHASE");

          let schoolId: string;
          let participantId: string | null = null;
          if (actor.kind === "STAFF") {
            if (!match.activeSchoolId) {
              throw new ApiError(409, "No active school", "INVALID_PHASE");
            }
            schoolId = match.activeSchoolId;
          } else {
            if (!match.activeSchoolId || match.activeSchoolId !== actor.schoolId) {
              throw new ApiError(403, "It is not your turn to answer", "NOT_YOUR_TURN");
            }
            schoolId = actor.schoolId;
            participantId = actor.participantId;
          }

          const text = (command.text ?? "").trim();
          if (!text) throw new ApiError(400, "Answer cannot be empty", "VALIDATION");
          if (text.length > 2000) {
            throw new ApiError(400, "Answer is too long", "VALIDATION");
          }

          if (
            (match.timerStatus === "RUNNING" &&
              match.timerDeadline &&
              match.timerDeadline.getTime() < now.getTime()) ||
            (match.timerStatus === "EXPIRED" &&
              match.timerPhase === "ANSWERING" &&
              config.timeoutAction !== "STAY_OPEN")
          ) {
            throw new ApiError(409, "Time is up", "TIME_EXPIRED");
          }

          const priorCount = await tx.answer.count({
            where: { matchQuestionId: mq.id, schoolId },
          });
          if (priorCount >= config.attempts.max) {
            throw new ApiError(409, "No attempts remaining", "ATTEMPTS_EXHAUSTED");
          }

          // Idempotent retry: an identical answer re-sent within seconds is a
          // lost-response retry from the same device, not a second attempt.
          const recent = await tx.answer.findFirst({
            where: { matchQuestionId: mq.id, schoolId },
            orderBy: { submittedAt: "desc" },
          });
          if (
            recent &&
            recent.text === text &&
            now.getTime() - recent.submittedAt.getTime() < 15_000
          ) {
            events.push({
              type: "ANSWER_SUBMITTED",
              payload: { answerId: recent.id, schoolId, attempt: recent.attempt, duplicate: true },
            });
            break;
          }

          const subjective = mq.question.type === "SUBJECTIVE";
          const answer = await tx.answer.create({
            data: {
              matchId: match.id,
              matchQuestionId: mq.id,
              schoolId,
              selectionId:
                (await tx.questionSelection.findFirst({
                  where: { matchId: match.id, matchQuestionId: mq.id, schoolId },
                  orderBy: { selectedAt: "desc" },
                }))?.id ?? null,
              participantId,
              text,
              verdict: subjective ? "PENDING" : "PENDING",
              isAuto: !subjective,
              attempt: priorCount + 1,
            },
          });

          events.push({
            type: "ANSWER_SUBMITTED",
            payload: {
              answerId: answer.id,
              schoolId,
              attempt: priorCount + 1,
              ...(config.answerDisplay.showSubmittedAnswer ? { text } : {}),
            },
          });

          // subjective answers always wait for the GM; GM_DECIDES means the GM
          // judges objective answers too instead of the engine auto-judging
          if (subjective || config.wrongAnswer === "GM_DECIDES") {
            await patchMatch({ phase: "JUDGING" });
            await stopTimerIfRunning(tx, match, now, null, "awaiting_judgment", events);
            break;
          }

          const result = judgeAnswer(
            {
              type: mq.question.type,
              answerKey: mq.question.answerKey,
              acceptedAlternatives: mq.question.acceptedAlternatives,
              numericTolerance: mq.question.numericTolerance,
              options: mq.question.options.map((o) => ({
                id: o.id,
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
            text,
            {
              caseSensitive: config.judging.caseSensitive,
              trimWhitespace: config.judging.trimWhitespace,
              partialMatch: config.judging.partialMatch,
            }
          );

          const verdict = result.correct ? "CORRECT" : "INCORRECT";
          await tx.answer.update({
            where: { id: answer.id },
            data: { verdict, judgedAt: now },
          });
          Object.assign(answer, { verdict });
          events.push({
            type: "ANSWER_JUDGED",
            payload: { answerId: answer.id, schoolId, verdict, auto: true },
          });

          // score the answer for the answering school (not selection school — same by guard)
          mq.selectedBySchoolId = schoolId;
          const bonusPoints =
            mq.bonusPoints ?? (mq.question.isBonus ? (mq.question.bonusPoints ?? 0) : 0);
          const delta = await awardScore(tx, match, config, mq, answer, now, events, bonusPoints);
          if (delta !== 0) {
            await adjustScore(tx, match.id, schoolId, delta, result.correct ? 1 : 0);
            const updated = await tx.matchSchool.findUniqueOrThrow({
              where: { matchId_schoolId: { matchId: match.id, schoolId } },
            });
            events.push({
              type: "SCORE_UPDATED",
              payload: { schoolId, delta, score: updated.score, source: "judgment" },
            });
          } else if (result.correct) {
            await adjustScore(tx, match.id, schoolId, 0, 1);
          }

          // A correct answer always ends the question. A wrong answer ends it
          // when the attempts are used up or the policy ends the turn; with
          // OFFER_STEAL the question stays open for the next school.
          const attemptsUsed = priorCount + 1;
          let finishedWithQuestion =
            verdict === "CORRECT" ||
            attemptsUsed >= config.attempts.max ||
            config.wrongAnswer === "END_TURN";
          // With OFFER_STEAL a wrong answer stays open while an un-attempted
          // school remains — the block below decides whether to offer it.
          if (verdict === "INCORRECT" && config.wrongAnswer === "OFFER_STEAL") {
            finishedWithQuestion = false;
          }

          if (
            !finishedWithQuestion &&
            verdict === "INCORRECT" &&
            config.wrongAnswer === "OFFER_STEAL"
          ) {
            const attempted = await tx.answer.findMany({
              where: { matchQuestionId: mq.id },
              select: { schoolId: true },
            });
            const attemptedIds = new Set(attempted.map((a) => a.schoolId));
            const order = match.schools.map((s) => s.schoolId);
            const startIdx = Math.max(0, order.indexOf(schoolId));
            const stealSchoolId = order
              .slice(startIdx + 1)
              .concat(order.slice(0, startIdx))
              .find((sid) => !attemptedIds.has(sid));
            if (stealSchoolId) {
              await patchMatch({ activeSchoolId: stealSchoolId });
              events.push({
                type: "STEAL_OFFERED",
                payload: {
                  matchQuestionId: mq.id,
                  fromSchoolId: schoolId,
                  toSchoolId: stealSchoolId,
                },
              });
            } else {
              finishedWithQuestion = true;
            }
          }

          if (finishedWithQuestion) {
            // auto-reveal: objective answers go straight to RESULT so the
            // school and audience see correct/wrong immediately (animated).
            await patchMatch({ phase: "RESULT" });
            await stopTimerIfRunning(tx, match, now, null, "answer_complete", events);
            events.push({
              type: "RESULT_REVEALED",
              payload: {
                matchQuestionId: mq.id,
                schoolId,
                verdict,
                points: delta,
              },
            });
          }
          break;
        }

        case "ANSWER_JUDGE": {
          const staff = assertStaff(actor);
          if (
            match.phase !== "JUDGING" &&
            match.phase !== "AWAITING_REVEAL" &&
            match.phase !== "RESULT"
          ) {
            throw new ApiError(409, "There is no answer awaiting judgment", "INVALID_PHASE");
          }
          const answer = command.answerId
            ? await tx.answer.findUnique({ where: { id: command.answerId } })
            : await tx.answer.findFirst({
                where: { matchId: match.id, verdict: "PENDING" },
                orderBy: { submittedAt: "desc" },
              });
          if (!answer || answer.matchId !== match.id) {
            throw new ApiError(404, "Answer not found", "NOT_FOUND");
          }
          const mq = match.questions.find((q) => q.id === answer.matchQuestionId);
          if (!mq) throw new ApiError(404, "Question not found", "NOT_FOUND");
          if (
            match.activeMatchQuestionId &&
            answer.matchQuestionId !== match.activeMatchQuestionId
          ) {
            throw new ApiError(
              409,
              "That answer belongs to a previous question",
              "INVALID_PHASE"
            );
          }
          if (mq.state === "VOIDED") {
            throw new ApiError(409, "That question was voided", "INVALID_PHASE");
          }

          const before = { verdict: answer.verdict };
          if (answer.verdict !== "PENDING" && answer.verdict !== command.verdict) {
            const reversals = await reverseScoresForAnswer(
              tx,
              answer.id,
              "answer_correction"
            );
            for (const r of reversals) {
              const updated = await tx.matchSchool.findUniqueOrThrow({
                where: { matchId_schoolId: { matchId: match.id, schoolId: r.schoolId } },
              });
              events.push({
                type: "SCORE_UPDATED",
                payload: {
                  schoolId: r.schoolId,
                  delta: r.delta,
                  score: updated.score,
                  source: "correction",
                },
              });
            }
          }

          await tx.answer.update({
            where: { id: answer.id },
            data: {
              verdict: command.verdict,
              judgedAt: now,
              judgedById: staff.userId,
              judgeNote: command.note ?? null,
            },
          });
          Object.assign(answer, { verdict: command.verdict });
          events.push({
            type: "ANSWER_JUDGED",
            payload: {
              answerId: answer.id,
              schoolId: answer.schoolId,
              verdict: command.verdict,
              auto: false,
            },
          });

          mq.selectedBySchoolId = answer.schoolId;
          if (before.verdict !== command.verdict) {
            // awardScore also raises the penalty for an INCORRECT verdict, so
            // manual judging scores exactly like the auto-judge path
            const bonusPoints =
              mq.bonusPoints ?? (mq.question.isBonus ? (mq.question.bonusPoints ?? 0) : 0);
            const delta = await awardScore(
              tx,
              match,
              config,
              mq,
              answer,
              now,
              events,
              bonusPoints
            );
            const correctDelta = command.verdict === "CORRECT" ? 1 : 0;
            if (delta !== 0 || correctDelta !== 0) {
              await adjustScore(tx, match.id, answer.schoolId, delta, correctDelta);
            }
            const updated = await tx.matchSchool.findUniqueOrThrow({
              where: { matchId_schoolId: { matchId: match.id, schoolId: answer.schoolId } },
            });
            events.push({
              type: "SCORE_UPDATED",
              payload: {
                schoolId: answer.schoolId,
                delta,
                score: updated.score,
                source: "judgment",
              },
            });
          }

          await audit(tx, actor, {
            action: "ANSWER_JUDGE",
            entityType: "Answer",
            entityId: answer.id,
            before,
            after: { verdict: command.verdict },
            reason: command.note,
            matchId: match.id,
          });

          if (match.phase === "JUDGING") {
            await patchMatch({ phase: "AWAITING_REVEAL" });
            await stopTimerIfRunning(tx, match, now, staff.userId, "judged", events);
          }
          break;
        }

        case "RESULT_REVEAL": {
          assertStaff(actor);
          if (match.phase !== "AWAITING_REVEAL") {
            throw new ApiError(409, "No result is awaiting reveal", "INVALID_PHASE");
          }
          await patchMatch({ phase: "RESULT" });
          // Only the ACTIVE question's answer belongs to this reveal — a
          // timeout or void must never surface a previous question's result.
          const latest = match.activeMatchQuestionId
            ? await tx.answer.findFirst({
                where: {
                  matchId: match.id,
                  matchQuestionId: match.activeMatchQuestionId,
                },
                orderBy: { submittedAt: "desc" },
              })
            : null;
          const scored = latest
            ? await tx.scoreEvent.findFirst({
                where: { answerId: latest.id },
                orderBy: { createdAt: "desc" },
              })
            : null;
          events.push({
            type: "RESULT_REVEALED",
            payload: {
              matchQuestionId: match.activeMatchQuestionId,
              schoolId: latest?.schoolId ?? match.activeSchoolId,
              verdict: latest?.verdict ?? null,
              points: scored?.points ?? 0,
            },
          });
          break;
        }

        // ── turn flow ──────────────────────────────────────────
        case "NEXT_TURN": {
          const staff = assertStaff(actor);
          if (match.phase !== "RESULT") {
            throw new ApiError(409, "Reveal the result before advancing", "INVALID_PHASE");
          }
          const activeMq = match.questions.find(
            (q) => q.id === match.activeMatchQuestionId
          );
          if (activeMq) {
            await tx.matchQuestion.update({
              where: { id: activeMq.id },
              data: { state: "COMPLETED" },
            });
            Object.assign(activeMq, { state: "COMPLETED" as const });
          }
          await advanceTurn(tx, match, config, now, staff.userId, events);
          break;
        }

        case "TURN_SKIP": {
          const staff = assertStaff(actor);
          if (!config.turns.skipAllowed) {
            throw new ApiError(403, "Skipping turns is disabled for this match", "FORBIDDEN");
          }
          if (match.status !== "LIVE" || match.phase === "RESULT" || match.phase === "ENDED") {
            throw new ApiError(409, "Turn cannot be skipped in this phase", "INVALID_PHASE");
          }
          if (!command.reason) {
            throw new ApiError(400, "A reason is required to skip a turn", "VALIDATION");
          }
          // never orphan a subjective answer — it would be judged out of
          // context later and score against the wrong question
          const pendingForTurn = await tx.answer.findFirst({
            where: {
              matchId: match.id,
              verdict: "PENDING",
              ...(match.activeMatchQuestionId
                ? { matchQuestionId: match.activeMatchQuestionId }
                : {}),
            },
          });
          if (pendingForTurn) {
            throw new ApiError(
              409,
              "Judge the pending answer before skipping the turn",
              "INVALID_PHASE"
            );
          }
          const activeMq = match.questions.find(
            (q) => q.id === match.activeMatchQuestionId
          );
          if (activeMq) {
            const nextState = activeMq.state === "SELECTED" ? "AVAILABLE" : "DISABLED";
            await tx.matchQuestion.update({
              where: { id: activeMq.id },
              data: { state: nextState, selectedBySchoolId: null, selectedAt: null },
            });
            Object.assign(activeMq, { state: nextState });
            if (nextState === "AVAILABLE") await patchMatch({ activeMatchQuestionId: null });
          }
          await stopTimerIfRunning(tx, match, now, staff.userId, "turn_skipped", events);
          await audit(tx, actor, {
            action: "TURN_SKIP",
            entityType: "Match",
            entityId: match.id,
            reason: command.reason,
            matchId: match.id,
          });
          events.push({
            type: "TURN_SKIPPED",
            payload: {
              turnIndex: match.currentTurnIndex,
              schoolId: match.activeSchoolId,
              reason: command.reason,
            },
          });
          await advanceTurn(tx, match, config, now, staff.userId, events, "turn_skipped");
          break;
        }

        case "TURN_REPEAT": {
          const staff = assertStaff(actor);
          if (!config.turns.repeatAllowed) {
            throw new ApiError(403, "Repeating turns is disabled for this match", "FORBIDDEN");
          }
          if (match.phase !== "RESULT") {
            throw new ApiError(409, "Only a revealed turn can be repeated", "INVALID_PHASE");
          }
          if (!command.reason) {
            throw new ApiError(400, "A reason is required to repeat a turn", "VALIDATION");
          }
          const activeMq = match.questions.find(
            (q) => q.id === match.activeMatchQuestionId
          );
          if (activeMq && activeMq.state !== "COMPLETED") {
            await tx.matchQuestion.update({
              where: { id: activeMq.id },
              data: { state: "DISABLED" },
            });
            Object.assign(activeMq, { state: "DISABLED" as const });
          }
          await patchMatch({ phase: "SELECTION", activeMatchQuestionId: null, timerPhase: "SELECTION" });
          await audit(tx, actor, {
            action: "TURN_REPEAT",
            entityType: "Match",
            entityId: match.id,
            reason: command.reason,
            matchId: match.id,
          });
          events.push({
            type: "TURN_REPEATED",
            payload: { turnIndex: match.currentTurnIndex, schoolId: match.activeSchoolId },
          });
          if (!hasAvailableQuestions(match)) {
            // nothing left to replay — end the match instead of stranding it
            // in SELECTION with an empty board
            await endMatch(tx, match, config, now, staff.userId, events, "questions_exhausted");
            break;
          }
          events.push({ type: "QUESTION_SELECTION_OPENED", payload: { turnIndex: match.currentTurnIndex } });
          break;
        }

        // ── timer / visibility / scoring overrides ─────────────
        case "TIMER_SET": {
          const staff = assertStaff(actor);
          if (match.status !== "LIVE" && match.status !== "PAUSED") {
            throw new ApiError(409, "Match is not active", "INVALID_PHASE");
          }
          await applyTimerAction(
            tx,
            match,
            command.action,
            command.ms,
            now,
            staff.userId,
            command.reason
          );
          if (command.reason) {
            await audit(tx, actor, {
              action: `TIMER_${command.action}`,
              entityType: "Match",
              entityId: match.id,
              reason: command.reason,
              matchId: match.id,
            });
          }
          events.push({ type: "TIMER_UPDATED", payload: timerEventPayload(match) });
          break;
        }

        case "LEADERBOARD_SET": {
          assertStaff(actor);
          // leaderboard and break show are mutually exclusive on the venue
          // screen — flip them together so the screen never renders both
          await patchMatch({
            leaderboardVisible: command.visible,
            ...(command.visible ? { breakActive: false } : {}),
          });
          events.push({
            type: "LEADERBOARD_VISIBILITY_CHANGED",
            payload: { visible: command.visible },
          });
          if (command.visible) {
            events.push({ type: "BREAK_CHANGED", payload: { visible: false } });
          }
          break;
        }

        case "BREAK_SET": {
          const staff = assertStaff(actor);
          await patchMatch({
            breakActive: command.visible,
            ...(command.visible ? { leaderboardVisible: false } : {}),
          });
          // a break pauses any running timer so no one's clock burns while
          // the venue show is on
          if (command.visible) {
            await stopTimerIfRunning(tx, match, now, staff.userId, "break_started", events);
          }
          events.push({
            type: "BREAK_CHANGED",
            payload: { visible: command.visible },
          });
          if (command.visible) {
            events.push({ type: "LEADERBOARD_VISIBILITY_CHANGED", payload: { visible: false } });
          }
          break;
        }

        case "SCORE_OVERRIDE": {
          const staff = assertStaff(actor);
          if (!command.reason?.trim()) {
            throw new ApiError(400, "A reason is required for score overrides", "VALIDATION");
          }
          if (!Number.isInteger(command.points) || command.points === 0) {
            throw new ApiError(400, "Points must be a non-zero integer", "VALIDATION");
          }
          const row = await tx.matchSchool.findUnique({
            where: { matchId_schoolId: { matchId: match.id, schoolId: command.schoolId } },
          });
          if (!row) throw new ApiError(404, "School is not in this match", "NOT_FOUND");

          await tx.scoreEvent.create({
            data: {
              matchId: match.id,
              schoolId: command.schoolId,
              type: "MANUAL_ADJUSTMENT",
              points: command.points,
              reason: command.reason,
              createdById: staff.userId,
            },
          });
          await adjustScore(tx, match.id, command.schoolId, command.points, 0);
          const updated = await tx.matchSchool.findUniqueOrThrow({
            where: { matchId_schoolId: { matchId: match.id, schoolId: command.schoolId } },
          });
          await audit(tx, actor, {
            action: "SCORE_OVERRIDE",
            entityType: "MatchSchool",
            entityId: row.id,
            before: { score: row.score },
            after: { score: updated.score },
            reason: command.reason,
            matchId: match.id,
          });
          events.push({
            type: "SCORE_UPDATED",
            payload: {
              schoolId: command.schoolId,
              delta: command.points,
              score: updated.score,
              source: "override",
            },
          });
          break;
        }

        case "QUESTION_VOID": {
          const staff = assertStaff(actor);
          if (!command.reason?.trim()) {
            throw new ApiError(400, "A reason is required to void a question", "VALIDATION");
          }
          const mq = match.questions.find((q) => q.id === command.matchQuestionId);
          if (!mq) throw new ApiError(404, "Question not found in this match", "NOT_FOUND");
          if (mq.state === "VOIDED") {
            throw new ApiError(409, "Question is already voided", "INVALID_PHASE");
          }
          const beforeState = mq.state;

          await tx.matchQuestion.update({
            where: { id: mq.id },
            data: { state: "VOIDED", voidReason: command.reason },
          });
          Object.assign(mq, { state: "VOIDED" as const, voidReason: command.reason });

          const answers = await tx.answer.findMany({ where: { matchQuestionId: mq.id } });
          const affectedSchools = new Map<string, number>();
          for (const ans of answers) {
            const reversals = await reverseScoresForAnswer(
              tx,
              ans.id,
              `question_voided: ${command.reason}`
            );
            for (const r of reversals) {
              affectedSchools.set(
                r.schoolId,
                (affectedSchools.get(r.schoolId) ?? 0) + r.delta
              );
            }
          }
          for (const [schoolId, delta] of affectedSchools) {
            const updated = await tx.matchSchool.findUniqueOrThrow({
              where: { matchId_schoolId: { matchId: match.id, schoolId } },
            });
            events.push({
              type: "SCORE_UPDATED",
              payload: {
                schoolId,
                delta,
                score: updated.score,
                source: "question_void",
              },
            });
          }

          await audit(tx, actor, {
            action: "QUESTION_VOID",
            entityType: "MatchQuestion",
            entityId: mq.id,
            before: { state: beforeState },
            after: { state: "VOIDED" },
            reason: command.reason,
            matchId: match.id,
          });

          events.push({
            type: "QUESTION_VOIDED",
            payload: { matchQuestionId: mq.id, reason: command.reason },
          });

          if (match.activeMatchQuestionId === mq.id) {
            await stopTimerIfRunning(tx, match, now, staff.userId, "question_voided", events);
            if (hasAvailableQuestions(match)) {
              await patchMatch({
                activeMatchQuestionId: null,
                phase: "SELECTION",
                timerPhase: "SELECTION",
              });
              events.push({
                type: "QUESTION_SELECTION_OPENED",
                payload: { turnIndex: match.currentTurnIndex },
              });
            } else {
              // the voided question was the last one — end cleanly instead of
              // leaving the board empty in SELECTION
              await patchMatch({ activeMatchQuestionId: null });
              await endMatch(
                tx,
                match,
                config,
                now,
                staff.userId,
                events,
                "questions_exhausted"
              );
            }
          }
          break;
        }

        case "QUALIFICATION_SET": {
          const staff = assertStaff(actor);
          const row = await tx.matchSchool.findUnique({
            where: { matchId_schoolId: { matchId: match.id, schoolId: command.schoolId } },
          });
          if (!row) throw new ApiError(404, "School is not in this match", "NOT_FOUND");
          const beforeQualification = row.qualification;

          await tx.matchSchool.update({
            where: { id: row.id },
            data: { qualification: command.status },
          });
          Object.assign(row, { qualification: command.status });

          await audit(tx, actor, {
            action: "QUALIFICATION_SET",
            entityType: "MatchSchool",
            entityId: row.id,
            before: { qualification: beforeQualification },
            after: { qualification: command.status },
            reason: command.reason,
            matchId: match.id,
          });
          events.push({
            type: "QUALIFICATION_UPDATED",
            payload: {
              source: "manual",
              schoolId: command.schoolId,
              status: command.status,
              reason: command.reason,
              by: staff.loginId,
            },
          });
          break;
        }
      }

      // ── automatic turn advancement (spec §5.1 step 12) ──────
      // Whenever a result appears, schedule (or clear) the server-side
      // auto-advance deadline. Clients render a countdown; enforcement is
      // lazy and authoritative, exactly like timers.
      if (
        match.phase === "RESULT" &&
        phaseBefore !== "RESULT" &&
        match.status === "LIVE" &&
        config.flow.autoAdvance
      ) {
        const at = new Date(
          now.getTime() + Math.max(1, config.flow.autoAdvanceSec) * 1000
        );
        await tx.match.update({ where: { id: matchId }, data: { autoAdvanceAt: at } });
        Object.assign(match, { autoAdvanceAt: at });
      } else if (match.phase !== "RESULT" && match.autoAdvanceAt) {
        await tx.match.update({ where: { id: matchId }, data: { autoAdvanceAt: null } });
        Object.assign(match, { autoAdvanceAt: null });
      }

      // ── append events + bump version (all inside the lock) ──
      const startSeq = match.eventCounter;
      const nextVersion = match.version + 1;
      const context = {
        matchId,
        version: nextVersion,
        phase: match.phase,
        status: match.status,
        serverTimeMs: Date.now(),
      };

      let seq = startSeq;
      for (const event of events) {
        seq += 1;
        await tx.matchEvent.create({
          data: {
            matchId,
            seq,
            type: event.type,
            payload: { ...event.payload, ...context } as Prisma.InputJsonValue,
          },
        });
        // broadcast payloads must carry the version so subscribed clients
        // know a newer snapshot is available (same as handleTimerExpiry)
        Object.assign(event.payload, context);
      }
      if (events.length > 0) {
        await tx.match.update({
          where: { id: matchId },
          data: { eventCounter: seq, version: { increment: 1 } },
        });
      }
    },
    { timeout: 15_000, maxWait: 5_000 }
  );

  const snapshot = await buildSnapshot(
    matchId,
    actor.kind === "STAFF" ? "STAFF" : "SCHOOL",
    actor.kind === "SCHOOL" ? actor.schoolId : undefined
  );
  if (!snapshot) throw new ApiError(404, "Match not found", "NOT_FOUND");
  return { snapshot, events };
}

/**
 * Called by the lazy deadline enforcement when the auto-advance moment
 * passes. Hands the turn to the next school without any client input —
 * the same transition as the GM pressing “Next turn”.
 */
export async function handleAutoAdvance(matchId: string): Promise<Emitted[]> {
  const events: Emitted[] = [];
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      await lockMatch(tx, matchId);
      const match = await loadMatch(tx, matchId);
      const config = parseMatchConfig(match.config);

      if (match.status !== "LIVE" || match.phase !== "RESULT") return;
      if (match.breakActive) return;
      if (!match.autoAdvanceAt || match.autoAdvanceAt.getTime() > now.getTime()) return;

      const activeMq = match.questions.find(
        (q) => q.id === match.activeMatchQuestionId
      );
      if (activeMq) {
        await tx.matchQuestion.update({
          where: { id: activeMq.id },
          data: { state: "COMPLETED" },
        });
        Object.assign(activeMq, { state: "COMPLETED" as const });
      }
      await tx.match.update({ where: { id: matchId }, data: { autoAdvanceAt: null } });
      Object.assign(match, { autoAdvanceAt: null });

      await advanceTurn(tx, match, config, now, null, events, "auto_advance");

      const context = {
        matchId,
        version: match.version + 1,
        phase: match.phase,
        status: match.status,
        serverTimeMs: Date.now(),
      };
      let seq = match.eventCounter;
      for (const event of events) {
        seq += 1;
        await tx.matchEvent.create({
          data: {
            matchId,
            seq,
            type: event.type,
            payload: { ...event.payload, ...context } as Prisma.InputJsonValue,
          },
        });
        Object.assign(event.payload, context);
      }
      await tx.match.update({
        where: { id: matchId },
        data: { eventCounter: seq, version: { increment: 1 } },
      });
    },
    { timeout: 15_000, maxWait: 5_000 }
  );

  return events;
}

/**
 * Called by the realtime service when a server deadline passes.
 * Closes the phase according to the configured timeout action.
 */
export async function handleTimerExpiry(matchId: string): Promise<Emitted[]> {
  const events: Emitted[] = [];
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      await lockMatch(tx, matchId);
      const match = await loadMatch(tx, matchId);
      if (match.timerStatus !== "RUNNING") return;
      if (!match.timerDeadline || match.timerDeadline.getTime() > now.getTime()) return;

      const config = parseMatchConfig(match.config);
      const expiredDeadline = match.timerDeadline;
      const previousValueMs = Math.max(0, expiredDeadline.getTime() - now.getTime());

      await tx.match.update({
        where: { id: match.id },
        data: {
          timerStatus: "EXPIRED",
          timerRemainingMsOnPause: 0,
          timerDeadline: null,
          timerStartedAt: null,
        },
      });
      Object.assign(match, {
        timerStatus: "EXPIRED" as const,
        timerRemainingMsOnPause: 0,
        timerDeadline: null,
        timerStartedAt: null,
      });
      await tx.timerEvent.create({
        data: {
          matchId: match.id,
          action: "EXPIRE",
          phase: match.phase,
          previousValueMs,
          newValueMs: 0,
          deadlineBefore: expiredDeadline,
          deadlineAfter: null,
          reason: "deadline_reached",
        },
      });
      events.push({ type: "TIMER_EXPIRED", payload: timerEventPayload(match) });

      if (match.phase === "SELECTION") {
        // the school did not pick in time — move the turn along so the match
        // can never stall on an idle device
        await advanceTurn(tx, match, config, now, null, events, "selection_timeout");
      } else if (match.phase === "ANSWERING" && config.timeoutAction !== "STAY_OPEN") {
        const mq = match.questions.find((q) => q.id === match.activeMatchQuestionId);
        if (config.timeoutAction === "AUTO_INCORRECT" && mq && match.activeSchoolId) {
          const priorCount = await tx.answer.count({
            where: { matchQuestionId: mq.id, schoolId: match.activeSchoolId },
          });
          const answer = await tx.answer.create({
            data: {
              matchId: match.id,
              matchQuestionId: mq.id,
              schoolId: match.activeSchoolId,
              text: "(no answer — time expired)",
              verdict: "INCORRECT",
              isAuto: true,
              attempt: priorCount + 1,
            },
          });
          mq.selectedBySchoolId = match.activeSchoolId;
          const bonusPoints =
            mq.bonusPoints ?? (mq.question.isBonus ? (mq.question.bonusPoints ?? 0) : 0);
          const delta = await awardScore(
            tx,
            match,
            config,
            mq,
            answer,
            now,
            events,
            bonusPoints
          );
          if (delta !== 0) {
            await adjustScore(tx, match.id, match.activeSchoolId, delta, 0);
          }
          await tx.match.update({
            where: { id: match.id },
            data: { phase: "RESULT" },
          });
          Object.assign(match, { phase: "RESULT" as const });
          events.push({
            type: "RESULT_REVEALED",
            payload: {
              matchQuestionId: mq.id,
              schoolId: match.activeSchoolId,
              verdict: "INCORRECT",
              points: delta,
            },
          });
        } else {
          await tx.match.update({
            where: { id: match.id },
            data: { phase: "AWAITING_REVEAL" },
          });
          Object.assign(match, { phase: "AWAITING_REVEAL" as const });
        }
      }

      const context = {
        matchId,
        version: match.version + 1,
        phase: match.phase,
        status: match.status,
        serverTimeMs: Date.now(),
      };
      let seq = match.eventCounter;
      for (const event of events) {
        seq += 1;
        await tx.matchEvent.create({
          data: {
            matchId,
            seq,
            type: event.type,
            payload: { ...event.payload, ...context } as Prisma.InputJsonValue,
          },
        });
        Object.assign(event.payload, context);
      }
      await tx.match.update({
        where: { id: matchId },
        data: { eventCounter: seq, version: { increment: 1 } },
      });
    },
    { timeout: 15_000, maxWait: 5_000 }
  );

  return events;
}
