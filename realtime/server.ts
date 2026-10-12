// Realtime service: Socket.IO + authoritative timer enforcement.
// Runs as a separate process from Next.js (see package.json scripts).
// Next.js broadcasts here via POST /internal/emit after committing state.

import { createServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { prisma } from "../src/lib/db";
import { buildSnapshot } from "../src/lib/engine/snapshot";
import { handleTimerExpiry } from "../src/lib/engine/commands";

const PORT = Number(process.env.REALTIME_PORT ?? 4000);
const INTERNAL_SECRET = process.env.REALTIME_INTERNAL_SECRET ?? "";

type Identity =
  | { kind: "STAFF"; userId: string; role: string }
  | { kind: "SCHOOL"; participantId: string; schoolId: string }
  | { kind: "PUBLIC" };

type SocketData = {
  identity: Identity;
  matches: Set<string>;
};

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function identityFromCookieHeader(header?: string): Promise<Identity> {
  const token = parseCookie(header, "fassa_session");
  if (!token) return { kind: "PUBLIC" };
  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true, participant: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) return { kind: "PUBLIC" };
    if (session.kind === "STAFF" && session.user?.active) {
      return { kind: "STAFF", userId: session.user.id, role: session.user.role };
    }
    if (session.participant) {
      return {
        kind: "SCHOOL",
        participantId: session.participant.id,
        schoolId: session.participant.schoolId,
      };
    }
  } catch (err) {
    console.error("[rt] identity lookup failed", err);
  }
  return { kind: "PUBLIC" };
}

async function canViewMatch(identity: Identity, matchId: string): Promise<boolean> {
  if (identity.kind !== "SCHOOL") return true;
  try {
    const mp = await prisma.matchParticipant.findFirst({
      where: { matchId, participantId: identity.participantId },
    });
    if (mp) return true;
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { schools: { select: { schoolId: true } } },
    });
    return !!match?.schools.some((s) => s.schoolId === identity.schoolId);
  } catch (err) {
    console.error("[rt] canViewMatch failed", err);
    return false;
  }
}

function connectionCount(io: SocketIOServer, matchId: string): number {
  return io.sockets.adapter.rooms.get(`match:${matchId}`)?.size ?? 0;
}

// ── HTTP server: health + internal broadcast ──────────────────
const httpServer = createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && req.url === "/health") {
    send(200, { ok: true, uptime: process.uptime() });
    return;
  }

  if (req.method === "POST" && req.url === "/internal/emit") {
    const secret = req.headers["x-internal-secret"];
    if (secret !== INTERNAL_SECRET) {
      send(403, { ok: false, error: "forbidden" });
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(raw) as {
          matchId?: string;
          channel?: string;
          type: string;
          payload?: Record<string, unknown>;
        };
        const payload = { type: body.type, payload: body.payload ?? {} };
        if (body.matchId) {
          io.to(`match:${body.matchId}`).emit("event", payload);
          const deadline = (body.payload as { deadlineMs?: number } | undefined)?.deadlineMs;
          if (body.type === "TIMER_UPDATED" && typeof deadline === "number") {
            scheduleExpiry(body.matchId, deadline);
          }
        }
        if (body.channel) {
          io.to(`channel:${body.channel}`).emit("event", payload);
        }
        send(200, { ok: true });
      } catch (err) {
        console.error("[rt] internal emit failed", err);
        send(400, { ok: false, error: "bad_request" });
      }
    });
    return;
  }

  send(404, { ok: false, error: "not_found" });
});

// ── Socket.IO ─────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: { origin: true, credentials: true },
  serveClient: false,
  pingInterval: 20_000,
  pingTimeout: 25_000,
});

async function broadcastConnectionStatus(matchId: string) {
  io.to(`match:${matchId}`).emit("event", {
    type: "CONNECTION_STATUS_CHANGED",
    payload: {
      matchId,
      connected: connectionCount(io, matchId),
      serverTimeMs: Date.now(),
    },
  });
}

io.on("connection", (socket: Socket) => {
  const data = socket.data as SocketData;
  data.matches = new Set<string>();
  data.identity = { kind: "PUBLIC" };

  void identityFromCookieHeader(socket.handshake.headers.cookie).then((identity) => {
    data.identity = identity;
  });

  socket.on(
    "subscribe",
    async (
      args: { matchId?: string },
      cb?: (reply: { ok: boolean; error?: string; snapshot?: unknown }) => void
    ) => {
      try {
        const matchId = args?.matchId;
        if (!matchId) {
          cb?.({ ok: false, error: "matchId required" });
          return;
        }
        // identity may still be resolving on first frame — resolve again cheaply
        if (data.identity.kind === "PUBLIC") {
          data.identity = await identityFromCookieHeader(socket.handshake.headers.cookie);
        }
        const allowed = await canViewMatch(data.identity, matchId);
        if (!allowed) {
          cb?.({ ok: false, error: "not authorized for this match" });
          return;
        }
        await socket.join(`match:${matchId}`);
        data.matches.add(matchId);

        const role =
          data.identity.kind === "STAFF"
            ? "STAFF"
            : data.identity.kind === "SCHOOL"
              ? "SCHOOL"
              : "PUBLIC";
        const viewerSchoolId =
          data.identity.kind === "SCHOOL" ? data.identity.schoolId : undefined;
        const snapshot = await buildSnapshot(matchId, role, viewerSchoolId);
        cb?.({ ok: true, snapshot: snapshot ?? undefined });

        // precise expiry scheduling for a running timer
        if (snapshot?.timer.status === "RUNNING" && snapshot.timer.deadlineMs) {
          scheduleExpiry(matchId, snapshot.timer.deadlineMs);
        }
        void broadcastConnectionStatus(matchId);
      } catch (err) {
        console.error("[rt] subscribe failed", err);
        cb?.({ ok: false, error: "subscription failed" });
      }
    }
  );

  socket.on("unsubscribe", (args: { matchId?: string }) => {
    if (!args?.matchId) return;
    void socket.leave(`match:${args.matchId}`);
    data.matches.delete(args.matchId);
    void broadcastConnectionStatus(args.matchId);
  });

  socket.on("disconnect", () => {
    for (const matchId of data.matches) {
      void broadcastConnectionStatus(matchId);
    }
  });
});

// ── Timer expiry: precise schedule + safety sweep ─────────────
const scheduled = new Map<string, NodeJS.Timeout>();

async function expireMatch(matchId: string) {
  try {
    const events = await handleTimerExpiry(matchId);
    for (const event of events) {
      io.to(`match:${matchId}`).emit("event", {
        type: event.type,
        payload: event.payload,
      });
    }
  } catch (err) {
    console.error("[rt] timer expiry failed", matchId, err);
  }
}

function scheduleExpiry(matchId: string, deadlineMs: number) {
  const existing = scheduled.get(matchId);
  if (existing) clearTimeout(existing);
  const delay = deadlineMs - Date.now() + 60;
  if (delay > 2_000_000_000 || delay < -60_000) return;
  const handle = setTimeout(() => {
    scheduled.delete(matchId);
    void expireMatch(matchId);
  }, Math.max(0, delay));
  scheduled.set(matchId, handle);
}

setInterval(() => {
  void (async () => {
    try {
      const expired = await prisma.match.findMany({
        where: { timerStatus: "RUNNING", timerDeadline: { lt: new Date() } },
        select: { id: true },
      });
      for (const row of expired) {
        if (!scheduled.has(row.id)) await expireMatch(row.id);
      }
    } catch (err) {
      console.error("[rt] sweep failed", err);
    }
  })();
}, 2_000).unref();

httpServer.listen(PORT, () => {
  console.log(`[rt] realtime service listening on :${PORT}`);
});

process.on("uncaughtException", (err) => {
  console.error("[rt] uncaught", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[rt] unhandled rejection", err);
});
