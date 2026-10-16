import { prisma } from "./db";
import { emitToMatch } from "./bus";
import { handleTimerExpiry } from "./engine/commands";

/**
 * Lazy timer enforcement — replaces the old realtime service's deadline
 * scheduler. Any snapshot read or command executes expiry authoritatively
 * inside a DB transaction when the deadline has passed, then broadcasts the
 * result. Clients polling (or receiving push) trigger this within a tick.
 */
export async function enforceTimerExpiry(matchId: string): Promise<void> {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { timerStatus: true, timerDeadline: true },
    });
    if (
      !match ||
      match.timerStatus !== "RUNNING" ||
      !match.timerDeadline ||
      match.timerDeadline.getTime() > Date.now()
    ) {
      return;
    }
    const events = await handleTimerExpiry(matchId);
    for (const event of events) {
      await emitToMatch(matchId, event.type, event.payload);
    }
  } catch (err) {
    console.error("[timer] lazy expiry failed", matchId, err);
  }
}
