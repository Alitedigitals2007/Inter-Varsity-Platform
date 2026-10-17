import { prisma } from "./db";
import { emitToMatch } from "./bus";
import { handleTimerExpiry, handleAutoAdvance } from "./engine/commands";

/**
 * Lazy deadline enforcement — replaces the old realtime service's deadline
 * scheduler. Any snapshot read or command executes due transitions
 * authoritatively inside a DB transaction, then broadcasts the result:
 *
 *   1. a running timer whose deadline has passed (spec §8.4)
 *   2. a result screen whose auto-advance moment has passed (spec §5.1)
 *
 * Clients polling (or receiving push) trigger this within a tick.
 */
export async function enforceMatchDeadlines(matchId: string): Promise<void> {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        status: true,
        phase: true,
        breakActive: true,
        timerStatus: true,
        timerDeadline: true,
        autoAdvanceAt: true,
      },
    });
    if (!match) return;

    const now = Date.now();
    const timerDue =
      match.timerStatus === "RUNNING" &&
      match.timerDeadline !== null &&
      match.timerDeadline.getTime() <= now;
    const autoDue =
      match.status === "LIVE" &&
      match.phase === "RESULT" &&
      !match.breakActive &&
      match.autoAdvanceAt !== null &&
      match.autoAdvanceAt.getTime() <= now;

    const events = [
      ...(timerDue ? await handleTimerExpiry(matchId) : []),
      ...(autoDue ? await handleAutoAdvance(matchId) : []),
    ];
    for (const event of events) {
      await emitToMatch(matchId, event.type, event.payload);
    }
  } catch (err) {
    console.error("[deadlines] lazy enforcement failed", matchId, err);
  }
}
