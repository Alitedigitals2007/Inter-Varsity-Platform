import { handle, ok, rateLimit, clientKey, requireIdentity } from "@/lib/api";
import { emitToMatch } from "@/lib/bus";
import { commandSchema } from "@/lib/engine/commandSchema";
import { executeCommand } from "@/lib/engine/commands";
import { enforceTimerExpiry } from "@/lib/timers";
import type { Actor } from "@/lib/engine/types";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ command: commandSchema });

export const POST = handle<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  const identity = await requireIdentity();

  rateLimit(
    clientKey(
      req,
      identity.kind === "SCHOOL" ? `cmd-s-${identity.participantId}` : "cmd-staff"
    ),
    60,
    60_000
  );

  const { command } = bodySchema.parse(await req.json());

  const actor: Actor =
    identity.kind === "STAFF"
      ? {
          kind: "STAFF",
          userId: identity.userId,
          loginId: identity.loginId,
          name: identity.name,
          role: identity.role,
        }
      : {
          kind: "SCHOOL",
          participantId: identity.participantId,
          schoolId: identity.schoolId,
          displayName: identity.displayName,
        };

  // catch up an expired timer before the command is judged against state
  await enforceTimerExpiry(id);

  const { snapshot, events } = await executeCommand(id, command, actor);

  for (const event of events) {
    await emitToMatch(id, event.type, event.payload);
  }

  return ok({ snapshot, events });
});
